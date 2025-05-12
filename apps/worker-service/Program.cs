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
using FgLabel.Worker.Integration.LabelRenderers;

var builder = Host.CreateDefaultBuilder(args)
    .ConfigureServices((context, services) =>
    {
        services.AddHostedService<PrintWorker>();
        
        // Register label renderers
        services.AddTransient<ILabelRenderer, ZplRenderer>();
        services.AddTransient<ILabelRenderer, TsplRenderer>();
        services.AddTransient<LabelRendererFactory>();
        
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
    private readonly LabelRendererFactory _rendererFactory;

    public PrintWorker(
        IConfiguration configuration, 
        ILogger<PrintWorker> logger,
        LabelRendererFactory rendererFactory)
    {
        _logger = logger;
        _rendererFactory = rendererFactory;
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
        var job = await connection.QuerySingleAsync<dynamic>("SELECT * FROM FgL.LabelPrintJob WHERE PrintJobId = @JobID", new { JobID = jobId });
        var template = await connection.QuerySingleAsync<dynamic>("SELECT * FROM FgL.LabelTemplate WHERE TemplateID = @TemplateID", new { TemplateID = job.TemplateId });
        var components = (await connection.QueryAsync<dynamic>("SELECT * FROM FgL.LabelTemplateComponent WHERE TemplateID = @TemplateID ORDER BY ComponentID", new { TemplateID = job.TemplateId })).ToList();
        
        try 
        {
            // ดึงข้อมูล data สำหรับแทนที่ placeholder
            var data = await FetchDataForLabel(job, connection);
            
            // ตรวจสอบว่าเป็น special label หรือไม่ โดยดูจากชื่อ batch
            string batchNo = job.BatchNo.ToString();
            bool isQcSample = batchNo.EndsWith("-QC");
            bool isFormSheet = batchNo.EndsWith("-FORM");
            bool isPalletTag = batchNo.EndsWith("-PALLET");
            
            // เลือก renderer ตาม template engine
            var renderer = _rendererFactory.GetRenderer(template.Engine ?? "ZPL");
            
            // สร้าง render options
            var renderOptions = new RenderOptions
            {
                Width = template.Width ?? 400,
                Height = template.Height ?? 300,
                DPI = template.DPI ?? 203,
                IncludeBarcode = true,
                IncludeQrCode = true
            };
            
            // Render ฉลากและได้ผลลัพธ์เป็น byte[]
            byte[] labelData;
            
            // Determine if we need to use the QuestPDF (PDF) renderer or specialized thermal printer renderer
            if (string.Equals(template.Engine, "PDF", StringComparison.OrdinalIgnoreCase) || 
                string.Equals(template.Engine, "HTML", StringComparison.OrdinalIgnoreCase))
            {
                // เตรียมข้อมูลเทมเพลตและอิลิเมนต์
                var contentJson = template.Content?.ToString() ?? "{}";
                var templateContent = JsonDocument.Parse(contentJson).RootElement;
                
                // ถ้าเป็น special label ให้เพิ่มแบนเนอร์ด้านล่าง
                if (isQcSample || isFormSheet || isPalletTag)
                {
                    // ปรับปรุง template โดยเพิ่มแบนเนอร์สีดำพร้อมข้อความ
                    contentJson = AddSpecialBanner(contentJson, isQcSample ? "QC SAMPLE" : 
                                                           isFormSheet ? "FORM SHEET" : "PALLET TAG");
                }
                
                // Generate HTML or PDF
                if (string.Equals(template.Engine, "HTML", StringComparison.OrdinalIgnoreCase))
                {
                    // สร้าง HTML และแปลงเป็น bytes
                    string html = GenerateHtmlFromTemplate(contentJson, data);
                    labelData = Encoding.UTF8.GetBytes(html);
                }
                else
                {
                    // Generate PDF
                    labelData = GeneratePdf(template, components, data);
                }
            }
            else
            {
                // Use appropriate renderer for thermal printers (ZPL/TSPL)
                // แปลง template เป็น raw commands
                string templateString = ConvertComponentsToTemplate(template, components);
                
                // ถ้าเป็น special label ให้เพิ่มคำสั่งแบนเนอร์ตามประเภทเครื่องพิมพ์
                if (isQcSample || isFormSheet || isPalletTag)
                {
                    string labelType = isQcSample ? "QC SAMPLE" : isFormSheet ? "FORM SHEET" : "PALLET TAG";
                    
                    if (string.Equals(template.Engine, "ZPL", StringComparison.OrdinalIgnoreCase))
                    {
                        // เพิ่มแบนเนอร์ ZPL
                        templateString = AddZplBanner(templateString, labelType);
                    }
                    else if (string.Equals(template.Engine, "TSPL", StringComparison.OrdinalIgnoreCase))
                    {
                        // เพิ่มแบนเนอร์ TSPL
                        templateString = AddTsplBanner(templateString, labelType);
                    }
                }
                
                // แปลง ZPL/TSPL commands เป็น byte[]
                labelData = renderer.RenderLabel(templateString, data, renderOptions);
            }
            
            // บันทึกข้อมูล label ที่ render แล้ว
            await connection.ExecuteAsync(@"
                UPDATE FgL.LabelPrintJob 
                SET PrintStatus = @Status, 
                    PrintData = @LabelData,
                    RequestedDate = GETDATE() 
                WHERE PrintJobId = @JobID", 
                new { 
                    JobID = jobId, 
                    Status = "Rendered",
                    LabelData = Convert.ToBase64String(labelData)
                });
            
            // Print if there's a printer assigned
            if (job.PrinterId != null && job.PrinterId > 0)
            {
                // ดึงข้อมูลเครื่องพิมพ์
                var printer = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT * FROM FgL.Printer WHERE PrinterID = @PrinterID", 
                    new { PrinterID = job.PrinterId });
                
                if (printer == null)
                {
                    throw new Exception($"Printer not found for ID: {job.PrinterId}");
                }
                
                string printerName = printer.Name?.ToString();
                string printerIpAddress = printer.IPAddress?.ToString();
                
                // สร้าง print options
                var printOptions = new PrintOptions
                {
                    Copies = job.PrintQuantity ?? 1,
                    Darkness = 10, // Default darkness
                    PrintSpeed = 3  // Default speed 
                };
                
                // ส่งไปพิมพ์
                bool printResult;
                
                if (!string.IsNullOrEmpty(printerIpAddress))
                {
                    // ใช้ IP Address (ส่งผ่าน TCP)
                    printResult = await renderer.PrintLabelAsync(printerIpAddress!, labelData, printOptions);
                }
                else
                {
                    // ใช้ชื่อเครื่องพิมพ์ (ส่งผ่าน Windows Printing)
                    printResult = await renderer.PrintLabelAsync(printerName!, labelData, printOptions);
                }
                
                // Update job status
                string status = printResult ? "Done" : "Error";
                await connection.ExecuteAsync(@"
                    UPDATE FgL.LabelPrintJob 
                    SET PrintStatus = @Status,
                        CompletedDate = CASE WHEN @Status = 'Done' THEN GETDATE() ELSE CompletedDate END
                    WHERE PrintJobId = @JobID", 
                    new { JobID = jobId, Status = status });
            }
            else
            {
                // ไม่มีเครื่องพิมพ์กำหนดไว้ เปลี่ยนสถานะเป็น Done
                await connection.ExecuteAsync(@"
                    UPDATE FgL.LabelPrintJob 
                    SET PrintStatus = 'Done',
                        CompletedDate = GETDATE()
                    WHERE PrintJobId = @JobID", 
                    new { JobID = jobId });
            }

            _logger.LogInformation("Processed print job {JobId} successfully", jobId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing print job {JobId}: {Message}", jobId, ex.Message);
            
            // บันทึกสถานะผิดพลาด
            await connection.ExecuteAsync(@"
                UPDATE FgL.LabelPrintJob 
                SET PrintStatus = 'Error',
                    ErrorMessage = @ErrorMessage
                WHERE PrintJobId = @JobID", 
                new { JobID = jobId, ErrorMessage = ex.Message });
        }
    }
    
    private async Task<Dictionary<string, object>> FetchDataForLabel(dynamic job, SqlConnection connection)
    {
        var data = new Dictionary<string, object>();
        
        // Add basic job data
        data["JobID"] = job.PrintJobId;
        data["Copies"] = job.PrintQuantity ?? 1;
        data["BatchNo"] = job.BatchNo ?? "";
        data["BagNo"] = job.BagNo ?? "";
        
        // Fetch additional data if BatchNo is provided
        if (!string.IsNullOrEmpty(job.BatchNo))
        {
            try
            {
                // Use the view we created for label data
                var parameters = new DynamicParameters();
                parameters.Add("@BatchNo", job.BatchNo);
                
                if (!string.IsNullOrEmpty(job.BagNo))
                {
                    parameters.Add("@BagNo", job.BagNo);
                }
                
                var sql = @"
                    SELECT * FROM FgL.vw_Label_PrintData 
                    WHERE BatchNo = @BatchNo";
                
                if (!string.IsNullOrEmpty(job.BagNo))
                {
                    sql += " AND BagNo = @BagNo";
                }
                
                var labelData = await connection.QueryFirstOrDefaultAsync<dynamic>(sql, parameters);
                
                if (labelData != null)
                {
                    // Add all properties from label data to the dictionary
                    foreach (var prop in ((IDictionary<string, object>)labelData))
                    {
                        if (prop.Value != null)
                        {
                            data[prop.Key] = prop.Value;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                string batchNo = job.BatchNo?.ToString() ?? "unknown";
                _logger.LogError(ex, "Error fetching data for batch {BatchNo}", batchNo);
                // Continue with basic data only
            }
        }
        
        return data;
    }
    
    private string ConvertComponentsToTemplate(dynamic template, List<dynamic> components)
    {
        if (!string.IsNullOrEmpty(template.RawContent))
        {
            return template.RawContent;
        }
        
        // Convert components to a template format based on the engine type
        var engineType = template.Engine?.ToUpper() ?? "ZPL";
        var builder = new StringBuilder();
        
        // Different conversion strategy based on engine type
        switch (engineType)
        {
            case "ZPL":
                // For ZPL, we'll build a ZPL command string
                foreach (var component in components.OrderBy(c => c.Y).ThenBy(c => c.X))
                {
                    var x = component.X ?? 10;
                    var y = component.Y ?? 10;
                    
                    switch (component.ComponentType?.ToLower())
                    {
                        case "text":
                            builder.AppendLine($"^FO{x},{y}^A0N,30,30^FD{component.StaticText}^FS");
                            break;
                        case "barcode":
                            builder.AppendLine($"^FO{x},{y}^BY3^BCN,100,Y,N,N^FD{component.StaticText}^FS");
                            break;
                        case "qr":
                            builder.AppendLine($"^FO{x},{y}^BQN,2,10^FD{component.StaticText}^FS");
                            break;
                    }
                }
                break;
                
            case "TSPL":
                // For TSPL, build a TSPL command string
                foreach (var component in components.OrderBy(c => c.Y).ThenBy(c => c.X))
                {
                    var x = component.X ?? 10;
                    var y = component.Y ?? 10;
                    
                    switch (component.ComponentType?.ToLower())
                    {
                        case "text":
                            builder.AppendLine($"TEXT {x}, {y}, \"3\", 0, 1, 1, \"{component.StaticText}\"");
                            break;
                        case "barcode":
                            builder.AppendLine($"BARCODE {x}, {y}, \"128\", 100, 1, 0, 2, 2, \"{component.StaticText}\"");
                            break;
                        case "qr":
                            builder.AppendLine($"QRCODE {x}, {y}, L, 5, A, 0, \"{component.StaticText}\"");
                            break;
                    }
                }
                break;
        }
        
        return builder.ToString();
    }

    private byte[] GeneratePdf(dynamic template, List<dynamic> components, Dictionary<string, object> data)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                // Set custom page size based on template dimensions
                if (template.Width.HasValue && template.Height.HasValue)
                {
                    // Convert from dots to points (1/72 inch)
                    var dpi = template.DPI ?? 203; // Default DPI for thermal printers
                    var widthInInches = template.Width.Value / (float)dpi;
                    var heightInInches = template.Height.Value / (float)dpi;
                    
                    // Convert to points (1/72 inch)
                    var widthInPoints = widthInInches * 72;
                    var heightInPoints = heightInInches * 72;
                    
                    page.Size(widthInPoints, heightInPoints);
                }
                else
                {
                    // Default to A6 size for labels
                    page.Size(PageSizes.A6);
                }
                
                // Remove margins for label printing
                page.Margin(0);
                page.DefaultTextStyle(x => x.FontSize(10));
                
                // Render components directly
                page.Content().Element(content => ComposeContent(content, template, components, data));
            });
        });
        return document.GeneratePdf();
    }

    private void ComposeContent(IContainer container, dynamic template, List<dynamic> components, Dictionary<string, object> data)
    {
        container.Column(column =>
        {
            // Render each component based on its position and type
            foreach (var component in components.OrderBy(c => c.Y))
            {
                string contentText = component.StaticText != null ? ReplacePlaceholders(component.StaticText.ToString(), data) : "";
                float x = Convert.ToSingle(component.X ?? 0);
                float y = Convert.ToSingle(component.Y ?? 0);
                float width = Convert.ToSingle(component.W ?? 100);
                float height = Convert.ToSingle(component.H ?? 30);
                
                // ใช้วิธีเรียกโดยตรงแทนการใช้ dynamic และ extension methods
                column.Item().Height(height).Width(width).PaddingLeft(x).PaddingTop(y).Element(element =>
                {
                    // ใช้ตัวแปร IContainer แทน dynamic
                    IContainer elementContainer = element;
                    string componentType = component.ComponentType?.ToString()?.ToLower() ?? "text";
                    
                    switch (componentType)
                    {
                        case "text":
                            int fontSize = component.FontSize != null ? Convert.ToInt32(component.FontSize) : 10;
                            // ใช้ extension method กับตัวแปร IContainer โดยตรง
                            elementContainer.Text(contentText).FontSize(fontSize);
                            break;
                        case "barcode":
                            if (OperatingSystem.IsWindows())
                            {
                                elementContainer.Image(GenerateBarcode(contentText));
                            }
                            else
                            {
                                // ทางเลือกสำหรับระบบปฏิบัติการอื่นที่ไม่ใช่ Windows
                                elementContainer.Text($"BARCODE: {contentText}").FontSize(10);
                                _logger.LogWarning("Barcode generation is only supported on Windows. Using text alternative.");
                            }
                            break;
                        case "qr":
                            if (OperatingSystem.IsWindows())
                            {
                                elementContainer.Image(GenerateQrCode(contentText));
                            }
                            else
                            {
                                // ทางเลือกสำหรับระบบปฏิบัติการอื่นที่ไม่ใช่ Windows
                                elementContainer.Text($"QR: {contentText}").FontSize(10);
                                _logger.LogWarning("QR code generation is only supported on Windows. Using text alternative.");
                            }
                            break;
                        case "image":
                            if (!string.IsNullOrEmpty(contentText))
                            {
                                try
                                {
                                    byte[] imageData = Convert.FromBase64String(contentText);
                                    elementContainer.Image(imageData);
                                }
                                catch (Exception ex)
                                {
                                    _logger.LogError("Error rendering image component: {Message}", ex.Message);
                                }
                            }
                            break;
                    }
                });
            }
        });
    }

    private string ReplacePlaceholders(string content, Dictionary<string, object> data)
    {
        if (string.IsNullOrEmpty(content)) return string.Empty;
        
        foreach (var item in data)
        {
            content = content.Replace($"${{{item.Key}}}", item.Value?.ToString() ?? string.Empty);
        }
        return content;
    }

    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
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

    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
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

    // เพิ่มฟังก์ชันเพื่อเพิ่มแบนเนอร์สีดำที่ด้านล่างของเทมเพลต JSON
    private string AddSpecialBanner(string contentJson, string bannerText)
    {
        try
        {
            // แปลง JSON string เป็น JsonDocument
            using var doc = JsonDocument.Parse(contentJson);
            
            // แปลงเป็น object ที่แก้ไขได้
            var tempObj = JsonSerializer.Deserialize<JsonElement>(contentJson);
            var jobject = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(contentJson);
            
            if (jobject == null)
            {
                return contentJson; // ถ้าแปลงไม่สำเร็จ ให้คืนค่าเดิม
            }
            
            // ดึงค่า canvasSize
            if (jobject.TryGetValue("canvasSize", out var canvasSizeElement))
            {
                var canvasSize = JsonSerializer.Deserialize<Dictionary<string, int>>(canvasSizeElement.GetRawText());
                if (canvasSize == null) return contentJson;
                
                int width = canvasSize["width"];
                int height = canvasSize["height"];
                
                // ดึงอิลิเมนต์ที่มีอยู่เดิม
                if (jobject.TryGetValue("elements", out var elementsElement))
                {
                    var elements = JsonSerializer.Deserialize<List<object>>(elementsElement.GetRawText());
                    if (elements == null) return contentJson;
                    
                    // สร้าง rectangle สีดำที่ด้านล่าง
                    var blackBanner = new Dictionary<string, object>
                    {
                        ["id"] = Guid.NewGuid().ToString(),
                        ["type"] = "rect",
                        ["x"] = 0,
                        ["y"] = height - 40, // 40px จากด้านล่าง
                        ["width"] = width,
                        ["height"] = 40,
                        ["fill"] = "#000000",
                        ["draggable"] = false
                    };
                    
                    // สร้างข้อความสีขาวกลางแบนเนอร์
                    var whiteText = new Dictionary<string, object>
                    {
                        ["id"] = Guid.NewGuid().ToString(),
                        ["type"] = "text",
                        ["x"] = 10,
                        ["y"] = height - 32, // กึ่งกลางของแบนเนอร์
                        ["width"] = width - 20,
                        ["height"] = 30,
                        ["text"] = bannerText,
                        ["fontSize"] = 20,
                        ["fontFamily"] = "Arial",
                        ["fontWeight"] = "bold",
                        ["fill"] = "#FFFFFF",
                        ["align"] = "center",
                        ["draggable"] = false
                    };
                    
                    // เพิ่มอิลิเมนต์ใหม่
                    elements.Add(blackBanner);
                    elements.Add(whiteText);
                    
                    // สร้าง JSON ใหม่
                    var newObject = new Dictionary<string, object>
                    {
                        ["canvasSize"] = canvasSize,
                        ["elements"] = elements
                    };
                    
                    return JsonSerializer.Serialize(newObject);
                }
            }
            
            return contentJson; // ถ้าไม่พบ canvasSize หรือ elements ให้คืนค่าเดิม
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding special banner: {Message}", ex.Message);
            return contentJson; // ถ้าเกิดข้อผิดพลาด ให้คืนค่าเดิม
        }
    }
    
    // เพิ่มแบนเนอร์สีดำกับข้อความสีขาวสำหรับ ZPL
    private string AddZplBanner(string zplTemplate, string bannerText)
    {
        // หาตำแหน่งของคำสั่งพิมพ์สุดท้าย (^XZ)
        int endIndex = zplTemplate.LastIndexOf("^XZ");
        if (endIndex < 0) return zplTemplate;
        
        // สร้างคำสั่ง ZPL สำหรับแบนเนอร์สีดำ
        var bannerCommands = new StringBuilder();
        bannerCommands.AppendLine();
        bannerCommands.AppendLine("^FO0,360^GB800,40,40^FS"); // สร้างกล่องสีดำขนาด 800x40
        bannerCommands.AppendLine($"^FO10,390^A0N,25,25^FD{bannerText}^FS"); // ข้อความสีขาว
        bannerCommands.AppendLine();
        
        // แทรกคำสั่งก่อนคำสั่งปิด
        return zplTemplate.Substring(0, endIndex) + bannerCommands.ToString() + "^XZ";
    }
    
    // เพิ่มแบนเนอร์สีดำกับข้อความสีขาวสำหรับ TSPL
    private string AddTsplBanner(string tsplTemplate, string bannerText)
    {
        // หาตำแหน่งของคำสั่ง PRINT สุดท้าย
        int endIndex = tsplTemplate.LastIndexOf("PRINT");
        if (endIndex < 0) return tsplTemplate;
        
        // สร้างคำสั่ง TSPL สำหรับแบนเนอร์สีดำ
        var bannerCommands = new StringBuilder();
        bannerCommands.AppendLine();
        bannerCommands.AppendLine("BOX 0,360,800,400,5"); // วาดกรอบสี่เหลี่ยมขนาด 800x40
        bannerCommands.AppendLine("BLOCK 0,360,800,40,\"B\""); // ระบายสีดำ
        bannerCommands.AppendLine($"TEXT 400,380,\"3\",0,1,1,\"{bannerText}\""); // ข้อความสีขาวตรงกลาง
        bannerCommands.AppendLine();
        
        // แทรกคำสั่งก่อนคำสั่งปิด
        return tsplTemplate.Substring(0, endIndex) + bannerCommands.ToString() + tsplTemplate.Substring(endIndex);
    }
    
    // ฟังก์ชันสร้าง HTML จาก template
    private string GenerateHtmlFromTemplate(string contentJson, Dictionary<string, object> data)
    {
        try
        {
            // แปลง JSON string เป็น object
            var content = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(contentJson);
            if (content == null) return "<div>Invalid template</div>";
            
            // ดึงค่า canvasSize
            if (!content.TryGetValue("canvasSize", out var canvasSizeElement))
            {
                return "<div>Invalid template: missing canvasSize</div>";
            }
            
            var canvasSize = JsonSerializer.Deserialize<Dictionary<string, int>>(canvasSizeElement.GetRawText());
            if (canvasSize == null) return "<div>Invalid canvasSize</div>";
            
            int width = canvasSize["width"];
            int height = canvasSize["height"];
            
            // ดึงอิลิเมนต์ทั้งหมด
            if (!content.TryGetValue("elements", out var elementsElement))
            {
                return "<div>Invalid template: missing elements</div>";
            }
            
            var elements = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(elementsElement.GetRawText());
            if (elements == null) return "<div>Invalid elements</div>";
            
            // เริ่มสร้าง HTML
            var html = new StringBuilder();
            html.AppendLine("<!DOCTYPE html>");
            html.AppendLine("<html>");
            html.AppendLine("<head>");
            html.AppendLine("  <meta charset=\"UTF-8\">");
            html.AppendLine("  <title>Label Preview</title>");
            html.AppendLine("  <style>");
            html.AppendLine("    body { margin: 0; padding: 0; }");
            html.AppendLine("    .canvas { position: relative; border: 1px solid #ccc; }");
            html.AppendLine("    .element { position: absolute; }");
            html.AppendLine("  </style>");
            html.AppendLine("</head>");
            html.AppendLine("<body>");
            html.AppendLine($"  <div class=\"canvas\" style=\"width:{width}px;height:{height}px;\">");
            
            // แปลงแต่ละอิลิเมนต์เป็น HTML
            foreach (var element in elements)
            {
                string type = element["type"].GetString() ?? "unknown";
                int x = element["x"].GetInt32();
                int y = element["y"].GetInt32();
                int elementWidth = element.TryGetValue("width", out var w) ? w.GetInt32() : 0;
                int elementHeight = element.TryGetValue("height", out var h) ? h.GetInt32() : 0;
                
                // สร้าง CSS พื้นฐาน
                string css = $"left:{x}px;top:{y}px;width:{elementWidth}px;height:{elementHeight}px;";
                
                switch (type)
                {
                    case "text":
                        string text = element["text"].GetString() ?? "";
                        int fontSize = element.TryGetValue("fontSize", out var fs) ? fs.GetInt32() : 12;
                        string fontFamily = element.TryGetValue("fontFamily", out var ff) ? ff.GetString() ?? "Arial" : "Arial";
                        string fill = element.TryGetValue("fill", out var f) ? f.GetString() ?? "#000000" : "#000000";
                        string fontWeight = element.TryGetValue("fontWeight", out var fw) ? fw.GetString() ?? "normal" : "normal";
                        string align = element.TryGetValue("align", out var a) ? a.GetString() ?? "left" : "left";
                        
                        css += $"font-family:{fontFamily};font-size:{fontSize}px;color:{fill};font-weight:{fontWeight};text-align:{align};";
                        
                        // แทนที่ตัวแปรใน text
                        foreach (var kvp in data)
                        {
                            text = text.Replace($"${{{kvp.Key}}}", kvp.Value?.ToString() ?? "");
                        }
                        
                        html.AppendLine($"    <div class=\"element\" style=\"{css}\">{text}</div>");
                        break;
                        
                    case "rect":
                        string rectFill = element.TryGetValue("fill", out var rf) ? rf.GetString() ?? "#000000" : "#000000";
                        css += $"background-color:{rectFill};";
                        html.AppendLine($"    <div class=\"element\" style=\"{css}\"></div>");
                        break;
                        
                    case "barcode":
                        string barcodeValue = element.TryGetValue("value", out var bv) ? bv.GetString() ?? "" : "";
                        
                        // แทนที่ตัวแปรใน barcodeValue
                        foreach (var kvp in data)
                        {
                            barcodeValue = barcodeValue.Replace($"${{{kvp.Key}}}", kvp.Value?.ToString() ?? "");
                        }
                        
                        // ใช้รูปภาพแทน barcode (จริงๆ ควรสร้าง barcode จริง)
                        html.AppendLine($"    <div class=\"element\" style=\"{css}\">");
                        html.AppendLine($"      <div style=\"width:100%;text-align:center;\">{barcodeValue}</div>");
                        html.AppendLine($"      <div style=\"width:100%;border:1px solid #000;height:40px;margin-top:5px;\"></div>");
                        html.AppendLine($"    </div>");
                        break;
                        
                    case "qr":
                        string qrValue = element.TryGetValue("value", out var qv) ? qv.GetString() ?? "" : "";
                        
                        // แทนที่ตัวแปรใน qrValue
                        foreach (var kvp in data)
                        {
                            qrValue = qrValue.Replace($"${{{kvp.Key}}}", kvp.Value?.ToString() ?? "");
                        }
                        
                        // ใช้รูปภาพแทน QR code (จริงๆ ควรสร้าง QR code จริง)
                        html.AppendLine($"    <div class=\"element\" style=\"{css}\">");
                        html.AppendLine($"      <div style=\"width:100%;border:1px solid #000;height:{elementHeight}px;\">");
                        html.AppendLine($"        <div style=\"text-align:center;padding-top:20px;\">QR: {qrValue}</div>");
                        html.AppendLine($"      </div>");
                        html.AppendLine($"    </div>");
                        break;
                        
                    default:
                        html.AppendLine($"    <div class=\"element\" style=\"{css}\">{type}</div>");
                        break;
                }
            }
            
            html.AppendLine("  </div>");
            html.AppendLine("</body>");
            html.AppendLine("</html>");
            
            return html.ToString();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating HTML from template: {Message}", ex.Message);
            return $"<div>Error generating preview: {ex.Message}</div>";
        }
    }

    public override void Dispose()
    {
        _channel?.Dispose();
        _rabbitMqConnection?.Dispose();
        base.Dispose();
    }
} 