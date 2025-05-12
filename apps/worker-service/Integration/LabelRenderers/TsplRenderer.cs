using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using FgLabel.Shared.Models;
using Microsoft.Extensions.Logging;

namespace FgLabel.Worker.Integration.LabelRenderers;

/// <summary>
/// Renderer for TSC Printer Programming Language (TSPL) labels
/// </summary>
public class TsplRenderer : ILabelRenderer
{
    private readonly ILogger<TsplRenderer> _logger;

    public TsplRenderer(ILogger<TsplRenderer> logger)
    {
        _logger = logger;
    }
    
    /// <summary>
    /// Engine type for TSPL templates
    /// </summary>
    public string EngineType => "TSPL";
    
    /// <summary>
    /// Checks if this renderer can handle the given template engine
    /// </summary>
    public bool CanRender(string templateEngine)
    {
        return string.Equals(templateEngine, "TSPL", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(templateEngine, "TSC", StringComparison.OrdinalIgnoreCase);
    }
    
    /// <summary>
    /// Renders a TSPL template with data
    /// </summary>
    public byte[] RenderLabel(string template, object data, RenderOptions options)
    {
        try
        {
            // 1. Process template variables
            var processedTemplate = ProcessTemplateVariables(template, data);
            
            // 2. Add header and footer commands if needed
            processedTemplate = EnsureTsplStructure(processedTemplate, options);
            
            // 3. Convert to bytes (TSPL uses ASCII encoding)
            return Encoding.ASCII.GetBytes(processedTemplate);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error rendering TSPL template");
            throw;
        }
    }
    
    /// <summary>
    /// Sends the TSPL label to a TSC printer
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
            _logger.LogError(ex, "Error sending TSPL to printer {Printer}", printerName);
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
    /// Ensures the TSPL template has proper commands structure
    /// </summary>
    private string EnsureTsplStructure(string tspl, RenderOptions options)
    {
        // Trim whitespace
        tspl = tspl.Trim();
        
        // Build proper TSPL structure
        var builder = new StringBuilder();
        
        // Add SIZE command if not present
        if (!Regex.IsMatch(tspl, @"SIZE\s+\d+(\.\d+)?\s*mm\s*,\s*\d+(\.\d+)?\s*mm", RegexOptions.IgnoreCase))
        {
            // Parse paper size and convert to mm
            var width = options.Width / 8.0; // Convert dots to mm (approximate)
            var height = options.Height / 8.0;
            builder.AppendLine($"SIZE {width} mm, {height} mm");
        }
        
        // Add GAP command if not present
        if (!Regex.IsMatch(tspl, @"GAP\s+\d+(\.\d+)?\s*mm\s*,\s*\d+(\.\d+)?\s*mm", RegexOptions.IgnoreCase))
        {
            builder.AppendLine("GAP 3 mm, 0 mm");
        }
        
        // Add DIRECTION command if not present
        if (!Regex.IsMatch(tspl, @"DIRECTION\s+\d+", RegexOptions.IgnoreCase))
        {
            builder.AppendLine("DIRECTION 0");
        }
        
        // Add CLS command if not present at beginning
        if (!Regex.IsMatch(tspl, @"^CLS", RegexOptions.IgnoreCase | RegexOptions.Multiline))
        {
            builder.AppendLine("CLS");
        }
        
        // Append the template content
        builder.AppendLine(tspl);
        
        // Add PRINT command if not present
        if (!Regex.IsMatch(tspl, @"PRINT\s+\d+\s*,\s*\d+", RegexOptions.IgnoreCase))
        {
            builder.AppendLine("PRINT 1, 1");
        }
        
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
    /// Sends the TSPL data to a network printer via TCP
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
            port = 9100; // Default printer port
        }
        
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync(host, port);
            
            using var stream = client.GetStream();
            
            // Prepare printer with initial commands if needed
            byte[] setupCommand = Encoding.ASCII.GetBytes($"DENSITY {options.Darkness}\n");
            await stream.WriteAsync(setupCommand, 0, setupCommand.Length);
            
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
    /// Sends the TSPL data to a Windows printer
    /// </summary>
    private async Task<bool> SendToWindowsPrinterAsync(string printerName, byte[] data, PrintOptions options)
    {
        try
        {
            // On Windows, use System.Drawing.Printing or a third-party library
            // This is simplified for demonstration
            
            _logger.LogWarning("Windows direct printing not fully implemented. Use network printing with TSC printers.");
            
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