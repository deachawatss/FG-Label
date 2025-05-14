using Microsoft.Extensions.Logging;

namespace FgLabel.Api.Integration.LabelRenderers;

/// <summary>
/// Factory class for creating appropriate label renderers based on template engine type
/// </summary>
public class LabelRendererFactory
{
    private readonly IEnumerable<ILabelRenderer> _renderers;
    private readonly ILogger<LabelRendererFactory> _logger;

    public LabelRendererFactory(
        IEnumerable<ILabelRenderer> renderers,
        ILogger<LabelRendererFactory> logger)
    {
        _renderers = renderers;
        _logger = logger;
    }

    /// <summary>
    /// Gets the appropriate renderer for the template engine type
    /// </summary>
    public ILabelRenderer GetRenderer(string templateEngine)
    {
        if (string.IsNullOrEmpty(templateEngine))
        {
            _logger.LogWarning("Template engine type is null or empty, defaulting to ZPL renderer");
            templateEngine = "ZPL"; // Default to ZPL
        }

        // Find a renderer that can handle this engine type
        var renderer = _renderers.FirstOrDefault(r => r.CanRender(templateEngine));

        if (renderer == null)
        {
            _logger.LogError("No renderer found for template engine type: {TemplateEngine}", templateEngine);
            throw new NotSupportedException($"No renderer found for template engine type: {templateEngine}");
        }

        _logger.LogDebug("Using {RendererType} for template engine {TemplateEngine}",
            renderer.GetType().Name, templateEngine);

        return renderer;
    }
} 