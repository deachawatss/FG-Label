using System.Text;
using System.Text.Json;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Polly;
using Polly.Retry;
using Microsoft.Extensions.Configuration;

namespace FgLabel.Worker.Services;

public class PrintJobHandler : BackgroundService
{
    private readonly ILogger<PrintJobHandler> _logger;
    private readonly IConfiguration _configuration;
    private IConnection _connection;
    private IModel _channel;
    private readonly AsyncRetryPolicy _retryPolicy;
    private const string QueueName = "print-jobs";
    private const string DlqName = "print-jobs-dlq";
    private const int MaxRetries = 3;

    public PrintJobHandler(ILogger<PrintJobHandler> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
        
        try
        {
            var host = _configuration["RabbitMQ__HostName"] ?? "localhost";
            var user = _configuration["RabbitMQ__UserName"] ?? "guest";
            var pass = _configuration["RabbitMQ__Password"] ?? "guest";

            _logger.LogInformation("RabbitMQ__HostName: {Host}", host);
            _logger.LogInformation("RabbitMQ__UserName: {User}", user);
            _logger.LogInformation("RabbitMQ__Password: {Pass}", pass);

            if (string.IsNullOrEmpty(host) || string.IsNullOrEmpty(user) || string.IsNullOrEmpty(pass))
            {
                _logger.LogError("RabbitMQ config missing! Host: {Host}, User: {User}, Pass: {Pass}", host, user, pass);
                throw new InvalidOperationException("RabbitMQ config missing!");
            }

            var factory = new ConnectionFactory
            {
                HostName = host,
                UserName = user,
                Password = pass
            };

            _connection = factory.CreateConnection();
            _channel = _connection.CreateModel();

            _logger.LogInformation("Connected to RabbitMQ at {HostName}", host);

            // Declare queues with dead letter exchange
            var dlqArgs = new Dictionary<string, object>
            {
                { "x-dead-letter-exchange", "" },
                { "x-dead-letter-routing-key", QueueName }
            };

            _channel.QueueDeclare(QueueName, durable: true, exclusive: false, autoDelete: false, arguments: dlqArgs);
            _channel.QueueDeclare(DlqName, durable: true, exclusive: false, autoDelete: false);

            // Configure retry policy with exponential backoff
            _retryPolicy = Policy
                .Handle<Exception>()
                .WaitAndRetryAsync(
                    MaxRetries,
                    retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)),
                    onRetry: (exception, timeSpan, retryCount, context) =>
                    {
                        _logger.LogWarning(
                            exception,
                            "Retry {RetryCount} after {Delay}ms due to: {Message}",
                            retryCount,
                            timeSpan.TotalMilliseconds,
                            exception.Message
                        );
                    }
                );
                    
            _logger.LogInformation("PrintJobHandler initialized successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize PrintJobHandler");
            throw;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("PrintJobHandler starting...");
        
        try
        {
            var consumer = new EventingBasicConsumer(_channel);
            consumer.Received += async (model, ea) =>
            {
                var body = ea.Body.ToArray();
                var message = Encoding.UTF8.GetString(body);
                var deliveryTag = ea.DeliveryTag;
                var messageId = ea.BasicProperties.MessageId ?? "unknown";

                _logger.LogInformation("Received message {MessageId}: {Message}", messageId, message);

                try
                {
                    await _retryPolicy.ExecuteAsync(async () =>
                    {
                        await ProcessPrintJob(message);
                    });

                    _channel.BasicAck(deliveryTag, false);
                    _logger.LogInformation("Message {MessageId} processed successfully", messageId);
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "Failed to process message {MessageId} after {MaxRetries} retries",
                        messageId,
                        MaxRetries
                    );
                    
                    // Move to DLQ with additional metadata
                    var properties = _channel.CreateBasicProperties();
                    properties.Persistent = true;
                    properties.Headers = new Dictionary<string, object>
                    {
                        { "x-original-message-id", messageId },
                        { "x-failure-reason", ex.Message },
                        { "x-failure-time", DateTime.UtcNow.ToString("O") }
                    };
                    
                    _channel.BasicPublish("", DlqName, properties, body);
                    _channel.BasicNack(deliveryTag, false, false);
                    
                    _logger.LogInformation(
                        "Message {MessageId} moved to DLQ with failure reason: {Reason}",
                        messageId,
                        ex.Message
                    );
                }
            };

            _channel.BasicConsume(
                queue: QueueName,
                autoAck: false,
                consumer: consumer
            );
                            
            _logger.LogInformation("PrintJobHandler is now consuming messages from {QueueName}", QueueName);

            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in PrintJobHandler");
            throw;
        }
    }

    private async Task ProcessPrintJob(string message)
    {
        try
        {
            var job = JsonSerializer.Deserialize<PrintJob>(message);
            if (job == null)
            {
                throw new InvalidOperationException("Invalid print job format");
            }

            _logger.LogInformation(
                "Processing print job: BatchNo={BatchNo}, TemplateId={TemplateId}, Copies={Copies}",
                job.BatchNo,
                job.TemplateId,
                job.Copies
            );

            // TODO: Implement actual printing logic here
            await Task.Delay(1000); // Simulate printing

            _logger.LogInformation(
                "Print job completed: BatchNo={BatchNo}, TemplateId={TemplateId}",
                job.BatchNo,
                job.TemplateId
            );
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to deserialize print job: {Message}", message);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process print job: {Message}", message);
            throw;
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("PrintJobHandler is stopping");
        _channel?.Close();
        _connection?.Close();
        await base.StopAsync(cancellationToken);
    }
}

public class PrintJob
{
    public string BatchNo { get; set; } = string.Empty;
    public string TemplateId { get; set; } = string.Empty;
    public int Copies { get; set; }
} 