using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using FgLabel.Worker.Services;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Microsoft.Extensions.Configuration;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ZXing;
using ZXing.QrCode;
using ZXing.Common;
using FgLabel.Shared.Models;
using FgLabel.Shared.Services;
using FgLabel.Shared.Utilities;

var builder = Host.CreateDefaultBuilder(args)
    .ConfigureServices((context, services) =>
    {
        services.AddHostedService<PrintWorker>();
        // Configure OpenTelemetry ในนี้
        services.AddOpenTelemetry()
            .WithTracing(b => b
                .AddSource("PrintJobHandler")
                .SetResourceBuilder(ResourceBuilder.CreateDefault().AddService(serviceName: "PrintJobHandler"))
                .AddConsoleExporter());
    });

var host = builder.Build();
host.Run();

public class PrintWorker : BackgroundService
{
    private readonly string _connectionString;
    private readonly IConnection _rabbitMqConnection;
    private readonly IModel _channel;
    private readonly ILogger<PrintWorker> _logger;

    public PrintWorker(IConfiguration configuration, ILogger<PrintWorker> logger)
    {
        _logger = logger;
        _connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection") 
            ?? configuration.GetConnectionString("DefaultConnection") 
            ?? throw new InvalidOperationException("DefaultConnection is not configured");
        var factory = new ConnectionFactory
        {
            HostName = Environment.GetEnvironmentVariable("RABBITMQ__HostName") ?? configuration["RabbitMQ:HostName"],
            UserName = Environment.GetEnvironmentVariable("RABBITMQ__UserName") ?? configuration["RabbitMQ:UserName"],
            Password = Environment.GetEnvironmentVariable("RABBITMQ__Password") ?? configuration["RabbitMQ:Password"]
        };
        _rabbitMqConnection = factory.CreateConnection();
        _channel = _rabbitMqConnection.CreateModel();

        // ตรวจสอบว่ามี queue อยู่แล้วหรือไม่
        try
        {
            _channel.QueueDeclarePassive("print-jobs");
        }
        catch
        {
            // ถ้าไม่มี queue ให้สร้างใหม่
            var args = new Dictionary<string, object>
            {
                { "x-dead-letter-exchange", "" },
                { "x-dead-letter-routing-key", "print-jobs-dlq" }
            };
            _channel.QueueDeclare("print-jobs", durable: true, exclusive: false, autoDelete: false, arguments: args);
            
            // สร้าง DLQ
            _channel.QueueDeclare("print-jobs-dlq", durable: true, exclusive: false, autoDelete: false);
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var consumer = new EventingBasicConsumer(_channel);
        consumer.Received += async (model, ea) =>
        {
            try
            {
                var body = ea.Body.ToArray();
                var message = Encoding.UTF8.GetString(body);
                var jobMsg = JsonSerializer.Deserialize<PrintJobMessage>(message);
                if (jobMsg == null)
                {
                    _logger.LogError("Invalid print job message: {Message}", message);
                    return;
                }
                await ProcessPrintJob(jobMsg.JobID);
                _channel.BasicAck(ea.DeliveryTag, false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing print job");
                _channel.BasicNack(ea.DeliveryTag, false, true);
            }
        };
        _channel.BasicConsume(queue: "print-jobs", autoAck: false, consumer: consumer);
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(1000, stoppingToken);
        }
    }

    private async Task ProcessPrintJob(long jobId)
    {
        using var connection = new SqlConnection(_connectionString);
        var job = await connection.QuerySingleAsync<LabelPrintJob>("SELECT * FROM FgL.LabelPrintJob WHERE JobID = @JobID", new { JobID = jobId });
        var template = await connection.QuerySingleAsync<LabelTemplate>("SELECT * FROM FgL.LabelTemplate WHERE TemplateID = @TemplateID", new { TemplateID = job.TemplateID });
        var components = (await connection.QueryAsync<LabelTemplateComponent>("SELECT * FROM FgL.LabelTemplateComponent WHERE TemplateID = @TemplateID ORDER BY ComponentID", new { TemplateID = job.TemplateID })).ToList();
        // TODO: ดึงข้อมูล data สำหรับแทนที่ Placeholder ตาม business logic
        var data = new Dictionary<string, object>();
        // สร้าง PDF (หรือ ZPL) ตาม Engine/CommandSet
        var pdfBytes = GeneratePdf(template, components, data);
        await connection.ExecuteAsync(@"UPDATE FgL.LabelPrintJob SET Status = 'printed', PdfBlob = @PdfBlob WHERE JobID = @JobID", new { JobID = jobId, PdfBlob = pdfBytes });
    }

    private byte[] GeneratePdf(LabelTemplate template, List<LabelTemplateComponent> components, Dictionary<string, object> data)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(2, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(10));
                page.Header().Element(ComposeHeader);
                page.Content().Element(content => ComposeContent(content, template, components, data));
            });
        });
        return document.GeneratePdf();
    }

    private void ComposeHeader(IContainer container)
    {
        container.Row(row =>
        {
            row.RelativeItem().Column(column =>
            {
                column.Item().Text("FG Label").SemiBold().FontSize(20).FontColor(Colors.Blue.Medium);
            });
        });
    }

    private void ComposeContent(IContainer container, LabelTemplate template, List<LabelTemplateComponent> components, Dictionary<string, object> data)
    {
        container.PaddingVertical(20).Column(column =>
        {
            foreach (var component in components.OrderBy(c => c.Y))
            {
                var content = ReplacePlaceholders(component.StaticText ?? "", data);
                var x = (float)component.X;
                var y = (float)component.Y;
                var width = (float)(component.W ?? 100);
                var height = (float)(component.H ?? 30);
                column.Item().PaddingLeft(x).PaddingTop(y).Width(width).Height(height).Element(element =>
                {
                    switch (component.ComponentType.ToLower())
                    {
                        case "text":
                            element.Text(content);
                            break;
                        case "barcode":
                            element.Image(GenerateBarcode(content));
                            break;
                        case "qr":
                            element.Image(GenerateQrCode(content));
                            break;
                        case "image":
                            if (!string.IsNullOrEmpty(content))
                                element.Image(Convert.FromBase64String(content));
                            break;
                    }
                });
            }
        });
    }

    private string ReplacePlaceholders(string content, Dictionary<string, object> data)
    {
        foreach (var item in data)
        {
            content = content.Replace($"{{{item.Key}}}", item.Value?.ToString() ?? string.Empty);
        }
        return content;
    }

    private byte[] GenerateBarcode(string content)
    {
        var writer = new BarcodeWriter<System.Drawing.Bitmap>
        {
            Format = BarcodeFormat.CODE_128,
            Options = new EncodingOptions
            {
                Width = 300,
                Height = 100,
                Margin = 0
            }
        };
        var bitmap = writer.Write(content);
        using var ms = new MemoryStream();
        bitmap.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        return ms.ToArray();
    }

    private byte[] GenerateQrCode(string content)
    {
        var writer = new BarcodeWriter<System.Drawing.Bitmap>
        {
            Format = BarcodeFormat.QR_CODE,
            Options = new QrCodeEncodingOptions
            {
                Width = 300,
                Height = 300,
                Margin = 0
            }
        };
        var bitmap = writer.Write(content);
        using var ms = new MemoryStream();
        bitmap.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        return ms.ToArray();
    }

    public override void Dispose()
    {
        _channel?.Dispose();
        _rabbitMqConnection?.Dispose();
        base.Dispose();
    }
} 