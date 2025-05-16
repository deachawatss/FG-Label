using System;
using System.Collections.Generic;

namespace FgLabel.Api.Models
{
    public class TemplateDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string ProductKey { get; set; } = string.Empty;
        public string CustomerKey { get; set; } = string.Empty;
        public string Engine { get; set; } = "HTML";
        public string PaperSize { get; set; } = "A6";
        public string Orientation { get; set; } = "Portrait";
        public int? CustomWidth { get; set; }
        public int? CustomHeight { get; set; }
        public string Content { get; set; } = string.Empty;
        public List<TemplateComponentDto> Components { get; set; } = new();
        public TemplateSettingsDto Settings { get; set; } = new();
    }
    
    public class TemplateSettingsDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Engine { get; set; } = "HTML";
        public string PaperSize { get; set; } = "A6";
        public string Orientation { get; set; } = "Portrait";
        public int? CustomWidth { get; set; }
        public int? CustomHeight { get; set; }
    }
    
    public class TemplateComponentDto
    {
        public int? ComponentId { get; set; }
        public string ComponentType { get; set; } = "Text";
        public decimal X { get; set; }
        public decimal Y { get; set; }
        public decimal W { get; set; }
        public decimal H { get; set; }
        public string? FontName { get; set; }
        public int? FontSize { get; set; }
        public string? FontWeight { get; set; }
        public string? FontStyle { get; set; }
        public string? Fill { get; set; }
        public string? Align { get; set; }
        public string? Placeholder { get; set; }
        public string? StaticText { get; set; }
        public string? BarcodeFormat { get; set; }
        public string? QrcodeFormat { get; set; }
        public string? ImageUrl { get; set; }
        public int Layer { get; set; }
        public bool Visible { get; set; } = true;
        public int? BorderWidth { get; set; }
        public string? BorderColor { get; set; }
        public string? BorderStyle { get; set; }
    }
    
    public class TemplateUpdateDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string ProductKey { get; set; } = string.Empty;
        public string CustomerKey { get; set; } = string.Empty;
        public string Engine { get; set; } = "HTML";
        public string PaperSize { get; set; } = "A6";
        public string Orientation { get; set; } = "Portrait";
        public int? CustomWidth { get; set; }
        public int? CustomHeight { get; set; }
        public string Content { get; set; } = string.Empty;
        public List<TemplateComponentDto> Components { get; set; } = new();
    }
    
    public class TemplateStandardDto
    {
        public int TemplateId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
    }
    
    public class AutoCreateTemplateDto
    {
        public string BatchNo { get; set; } = string.Empty;
        public string ProductKey { get; set; } = string.Empty;
        public string CustomerKey { get; set; } = string.Empty;
        public int StandardTemplateId { get; set; }
    }
} 