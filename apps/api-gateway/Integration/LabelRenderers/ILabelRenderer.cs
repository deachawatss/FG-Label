using FgLabel.Api.Models;

namespace FgLabel.Api.Integration.LabelRenderers;

/// <summary>
/// Interface for label renderers (ZPL, TSPL, etc.)
/// </summary>
public interface ILabelRenderer
{
    /// <summary>
    /// The type of template engine this renderer supports
    /// </summary>
    string EngineType { get; }
    
    /// <summary>
    /// Checks if this renderer can handle the given template engine
    /// </summary>
    bool CanRender(string templateEngine);
    
    /// <summary>
    /// Process a template with data to replace placeholders
    /// </summary>
    /// <param name="template">The template with placeholders</param>
    /// <param name="data">Data for replacing placeholders</param>
    /// <returns>Processed template with data replaced</returns>
    string ProcessTemplate(string template, object data);
    
    /// <summary>
    /// Renders a label from processed content
    /// </summary>
    /// <param name="processedContent">The processed content with data already replaced</param>
    /// <returns>Rendered label data as bytes</returns>
    byte[] RenderLabel(string processedContent);
    
    /// <summary>
    /// Sends label data to a printer via network
    /// </summary>
    /// <param name="printerAddress">IP address of the printer</param>
    /// <param name="labelData">The rendered label data</param>
    /// <returns>True if print was successful</returns>
    Task SendToPrinterAsync(string printerAddress, byte[] labelData);
}

/// <summary>
/// Options for rendering a label
/// </summary>
public class RenderOptions
{
    public string PaperSize { get; set; } = "4x4";
    public string Orientation { get; set; } = "Portrait";
    public int DPI { get; set; } = 203; // Common for thermal printers
    public int Width { get; set; } = 400; // Default width in pixels
    public int Height { get; set; } = 400; // Default height in pixels
    public bool IncludeQrCode { get; set; } = true;
    public bool IncludeBarcode { get; set; } = true;
}

/// <summary>
/// Options for printing a label
/// </summary>
public class PrintOptions
{
    public int Copies { get; set; } = 1;
    public bool UseBin { get; set; } = false;
    public string BinName { get; set; } = "";
    public int Darkness { get; set; } = 10; // 0-30 for most printers
    public int PrintSpeed { get; set; } = 4; // Inches per second
} 