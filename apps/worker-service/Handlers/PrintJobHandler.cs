using Microsoft.Extensions.Logging;
using FgLabel.Shared.Models;
using Integration;

namespace FgLabel.Worker.Handlers;

public class PrintJobHandler : IPrintJobHandler
{
    private readonly ILogger<PrintJobHandler> _logger;
    private readonly LabelPdfRenderer _pdfRenderer;

    public PrintJobHandler(ILogger<PrintJobHandler> logger, LabelPdfRenderer pdfRenderer)
    {
        _logger = logger;
        _pdfRenderer = pdfRenderer;
    }

    public async Task HandleAsync(PrintJob job)
    {
        try
        {
            _logger.LogInformation("Processing print job {JobId}", job.Id);

            // Generate HTML from template
            var html = GenerateHtml(job);

            // Render PDF
            var pdfBytes = _pdfRenderer.RenderLabel(html);

            // Save PDF
            var fileName = $"label_{job.Id}.pdf";
            await File.WriteAllBytesAsync(fileName, pdfBytes);

            _logger.LogInformation("Print job {JobId} completed successfully", job.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing print job {JobId}", job.Id);
            throw;
        }
    }

    private string GenerateHtml(PrintJob job)
    {
        return $@"
            <div style='font-family: Arial, sans-serif;'>
                <h1>Label {job.Id}</h1>
                <p>Batch No: {job.BatchNo}</p>
                <p>Customer: {job.CustomerName}</p>
                <p>Address: {job.Address}</p>
                <p>Items: {string.Join(", ", job.Items)}</p>
                <p>Copies: {job.Copies}</p>
            </div>
        ";
    }
} 