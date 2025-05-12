using FgLabel.Shared.Models;

namespace FgLabel.Worker.Integration.LabelRenderers;

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
    /// Renders a label template with data
    /// </summary>
    /// <param name="template">The raw template with placeholders</param>
    /// <param name="data">Data object containing values for placeholders</param>
    /// <param name="options">Rendering options like size, orientation</param>
    /// <returns>Rendered label data as bytes</returns>
    byte[] RenderLabel(string template, object data, RenderOptions options);
    
    /// <summary>
    /// Prints a rendered label to the specified printer
    /// </summary>
    /// <param name="printerName">Name or address of the printer</param>
    /// <param name="renderedLabel">The rendered label data</param>
    /// <param name="options">Print options like copies, darkness</param>
    /// <returns>True if print was successful</returns>
    Task<bool> PrintLabelAsync(string printerName, byte[] renderedLabel, PrintOptions options);
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