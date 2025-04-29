using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using FgLabel.Worker.Services;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = Host.CreateApplicationBuilder(args);

// Configure RabbitMQ
builder.Services.AddHostedService<PrintJobHandler>();

// Configure OpenTelemetry
builder.Services.AddOpenTelemetry()
    .WithTracing(builder => builder
        .AddSource("PrintJobHandler")
        .SetResourceBuilder(ResourceBuilder.CreateDefault()
            .AddService(serviceName: "PrintJobHandler"))
        .AddConsoleExporter());

var host = builder.Build();
host.Run(); 