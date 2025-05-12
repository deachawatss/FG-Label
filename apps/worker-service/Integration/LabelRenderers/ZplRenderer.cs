using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using FgLabel.Shared.Models;
using Microsoft.Extensions.Logging;

namespace FgLabel.Worker.Integration.LabelRenderers;

/// <summary>
/// Renderer for Zebra Programming Language (ZPL) labels
/// </summary>
public class ZplRenderer : ILabelRenderer
{
    private readonly ILogger<ZplRenderer> _logger;

    public ZplRenderer(ILogger<ZplRenderer> logger)
    {
        _logger = logger;
    }
    
    /// <summary>
    /// Engine type for ZPL templates
    /// </summary>
    public string EngineType => "ZPL";
    
    /// <summary>
    /// Checks if this renderer can handle the given template engine
    /// </summary>
    public bool CanRender(string templateEngine)
    {
        return string.Equals(templateEngine, "ZPL", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(templateEngine, "ZEBRA", StringComparison.OrdinalIgnoreCase);
    }
    
    /// <summary>
    /// Renders a ZPL template with data
    /// </summary>
    public byte[] RenderLabel(string template, object data, RenderOptions options)
    {
        try
        {
            // 1. Process template variables
            var processedTemplate = ProcessTemplateVariables(template, data);
            
            // 2. Add header and footer commands if needed
            processedTemplate = EnsureZplStructure(processedTemplate, options);
            
            // 3. Convert to bytes (ZPL uses ASCII encoding)
            return Encoding.ASCII.GetBytes(processedTemplate);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error rendering ZPL template");
            throw;
        }
    }
    
    /// <summary>
    /// Sends the ZPL label to a Zebra printer
    /// </summary>
    public async Task<bool> PrintLabelAsync(string printerName, byte[] renderedLabel, PrintOptions options)
    {
        try
        {
            // Check if printer is a network printer (IP:Port format)
            if (IsTcpPrinter(printerName))
            {
                return await SendToNetworkPrinterAsync(printerName, renderedLabel, options);
            }
            
            // Otherwise, try Windows printing
            return await SendToWindowsPrinterAsync(printerName, renderedLabel, options);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending ZPL to printer {Printer}", printerName);
            return false;
        }
    }
    
    /// <summary>
    /// Process template variables by replacing placeholders with actual data
    /// </summary>
    private string ProcessTemplateVariables(string template, object data)
    {
        if (data == null) return template;
        
        // Get all properties from data object
        var props = data.GetType().GetProperties();
        
        // Replace ${PropertyName} with actual values
        var result = template;
        foreach (var prop in props)
        {
            var placeholder = $"${{{prop.Name}}}";
            var value = prop.GetValue(data)?.ToString() ?? "";
            
            // Replace all occurrences
            result = result.Replace(placeholder, value);
        }
        
        return result;
    }
    
    /// <summary>
    /// Ensures the ZPL template has proper header and footer commands
    /// </summary>
    private string EnsureZplStructure(string zpl, RenderOptions options)
    {
        // Trim whitespace
        zpl = zpl.Trim();
        
        // If already enclosed in ^XA and ^XZ, return as is
        if (zpl.StartsWith("^XA") && zpl.EndsWith("^XZ"))
        {
            return zpl;
        }
        
        // Build proper ZPL structure
        var builder = new StringBuilder();
        
        // Start format
        builder.AppendLine("^XA");
        
        // Set label dimensions based on options
        builder.AppendLine($"^PW{options.Width}");
        builder.AppendLine($"^LL{options.Height}");
        
        // Set print speed if specified in printOptions (if available)
        // This won't be used during rendering, only when actually printing
        
        // Append the template content
        builder.AppendLine(zpl);
        
        // End format
        builder.Append("^XZ");
        
        return builder.ToString();
    }
    
    /// <summary>
    /// Determines if the printer name is in TCP format (IP:Port)
    /// </summary>
    private bool IsTcpPrinter(string printerName)
    {
        return Regex.IsMatch(printerName, @"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$");
    }
    
    /// <summary>
    /// Sends the ZPL data to a network printer via TCP
    /// </summary>
    private async Task<bool> SendToNetworkPrinterAsync(string printerAddress, byte[] data, PrintOptions options)
    {
        string host;
        int port;
        
        // Parse host and port
        if (printerAddress.Contains(':'))
        {
            var parts = printerAddress.Split(':');
            host = parts[0];
            port = int.Parse(parts[1]);
        }
        else
        {
            host = printerAddress;
            port = 9100; // Default ZPL port
        }
        
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync(host, port);
            
            using var stream = client.GetStream();
            
            // Send the data multiple times based on copies
            for (int i = 0; i < options.Copies; i++)
            {
                await stream.WriteAsync(data, 0, data.Length);
                await Task.Delay(100); // Small delay between copies
            }
            
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending data to network printer {Host}:{Port}", host, port);
            return false;
        }
    }
    
    /// <summary>
    /// Sends the ZPL data to a Windows printer
    /// </summary>
    private async Task<bool> SendToWindowsPrinterAsync(string printerName, byte[] data, PrintOptions options)
    {
        try
        {
            // On Windows, use System.Drawing.Printing or a third-party library
            // This is simplified for demonstration
            
            _logger.LogWarning("Windows direct printing not fully implemented. Use network printing with Zebra printers.");
            
            // Simulate printing delay
            await Task.Delay(500);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending data to Windows printer {Printer}", printerName);
            return false;
        }
    }
} 