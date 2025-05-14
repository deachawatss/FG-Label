using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace FgLabel.Api.Models
{
    // คลาสสำหรับ Label Template 
    public class LabelTemplate
    {
        public string? id { get; set; }
        public string? name { get; set; }
        public Size? canvasSize { get; set; }
        public List<LabelElement> elements { get; set; } = new List<LabelElement>();
    }

    public class Size 
    {
        public int width { get; set; }
        public int height { get; set; }
    }

    public class LabelElement
    {
        public string? id { get; set; }
        public string? type { get; set; }
        public int x { get; set; }
        public int y { get; set; }
        public int width { get; set; }
        public int height { get; set; }
        public string? text { get; set; }
        public int fontSize { get; set; }
        public string? fontFamily { get; set; }
        public string? fontStyle { get; set; }
        public string? fill { get; set; }
        public string? align { get; set; }
        public int layer { get; set; }
        public string? format { get; set; }
        public string? value { get; set; }
        public string? stroke { get; set; }
        public int strokeWidth { get; set; }
        public double opacity { get; set; }
    }

    // ย้ายจาก Shared
    public class LabelPrintJob
    {
        public long JobID { get; set; }
        public string BatchNo { get; set; } = string.Empty;
        public int? TemplateID { get; set; }
        public int? PrinterID { get; set; }
        public string? ProductKey { get; set; }
        public string? CustomerKey { get; set; }
        public int Copies { get; set; } = 1;
        public string Status { get; set; } = "queued";
        public string? PrintedBy { get; set; }
        public DateTime PrintedAt { get; set; }
        public byte[]? PdfBlob { get; set; }
    }

    public class BatchInfoDto
    {
        public int BatchId { get; set; }
        public string BatchName { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime ProductionDate { get; set; }
        public DateTime UpdatedAt { get; set; }
        public int TotalLabels { get; set; }
        public int PrintedLabels { get; set; }
    }

    public class BatchInfo
    {
        public string? BatchNo { get; set; }
        public DateTime ProductionDate { get; set; }
        public decimal NetWeight { get; set; }
        public int TotalBags { get; set; }
        public string? ProductKey { get; set; }
        public string? ProductName { get; set; }
        public string? PrintableDesc { get; set; }
        public string? UPCCODE { get; set; }
        public string? CustomerKey { get; set; }
        public string? CustomerName { get; set; }
        public string? Address_1 { get; set; }
        public string? Address_2 { get; set; }
        public string? Address_3 { get; set; }
        public string? City { get; set; }
        public string? State { get; set; }
        public string? Zip_Code { get; set; }
        public DateTime? DateExpiry { get; set; }
        public DateTime? FinalExpiryDate { get; set; }
        
        // New fields from BME_LABEL
        public string? PACKUNIT1 { get; set; }
        public decimal? PACKSIZE2 { get; set; }
        public string? PACKUNIT2 { get; set; }
        public int? SHELFLIFE_MONTH { get; set; }
        public int? SHELFLIFE_DAY { get; set; }
        public string? LABEL_COLOR { get; set; }
        public string? PRODUCT { get; set; }
        public string? DESCRIPTION { get; set; }
        public string? LOT_CODE { get; set; }
        public string? BEST_BEFORE { get; set; }
        public string? CUSTITEMCODE { get; set; }
        public string? ALLERGEN1 { get; set; }
        public string? ALLERGEN2 { get; set; }
        public string? ALLERGEN3 { get; set; }
        public string? STORECAP1 { get; set; }
        public string? GMO1 { get; set; }
        public string? INGREDLIST1 { get; set; }
        public string? INGREDLIST2 { get; set; }
        public string? INGREDLIST3 { get; set; }
        public string? COUNTRYOFORIGIN { get; set; }
        public string? THAINAME { get; set; }
        public string? FDANUMBER { get; set; }
        public string? INGREDIENTTHAI1 { get; set; }
        public string? INGREDIENTTHAI2 { get; set; }
        public string? INGREDIENTTHAI3 { get; set; }
        public string? ALLERGENTHAI1 { get; set; }
        public string? ALLERGENTHAI2 { get; set; }
        public string? PRODUCT_NAME_IN_ARABIC { get; set; }
        public string? INGREDIENT_LIST_IN_ARABIC_1 { get; set; }
        public string? INGREDIENT_LIST_IN_ARABIC_2 { get; set; }
        public string? INGREDIENT_LIST_IN_ARABIC_3 { get; set; }
        public string? ALLERGEN_IN_ARABIC_1 { get; set; }
        public string? ALLERGEN_IN_ARABIC_2 { get; set; }
        public string? ALLERGEN_IN_ARABIC_3 { get; set; }
        public string? PRODUCT_NAME_IN_CHINESE { get; set; }
        public string? INGREDIENT_LIST_IN_CHINESE_1 { get; set; }
        public string? INGREDIENT_LIST_IN_CHINESE_2 { get; set; }
        public string? INGREDIENT_LIST_IN_CHINESE_3 { get; set; }
        public string? ALLERGEN_IN_CHINESE_1 { get; set; }
        public string? ALLERGEN_IN_CHINESE_2 { get; set; }
        public string? ALLERGEN_IN_CHINESE_3 { get; set; }
    }

    public class LabelTemplateClass
    {
        public int TemplateID { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Engine { get; set; } = "html";
        public string PaperSize { get; set; } = "A6";
        public string Orientation { get; set; } = "Portrait";
        public string Content { get; set; } = string.Empty;
        public string? ProductKey { get; set; }
        public string? CustomerKey { get; set; }
        public int Version { get; set; } = 1;
        public bool Active { get; set; } = true;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<LabelTemplateComponent> Components { get; set; } = new();
    }

    public class LabelTemplateComponent
    {
        public int ComponentID { get; set; }
        public int TemplateID { get; set; }
        public string ComponentType { get; set; } = string.Empty;
        public decimal X { get; set; }
        public decimal Y { get; set; }
        public decimal? W { get; set; }
        public decimal? H { get; set; }
        public string? FontName { get; set; }
        public int? FontSize { get; set; }
        public string? Placeholder { get; set; }
        public string? StaticText { get; set; }
        public string? BarcodeFormat { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class LabelTemplateMapping
    {
        public int MappingID { get; set; }
        public int TemplateID { get; set; }
        public string? ProductKey { get; set; }
        public string? CustomerKey { get; set; }
        public int Priority { get; set; } = 5;
        public bool Active { get; set; } = true;
        public DateTime CreatedAt { get; set; }
    }

    public class CreateTemplateRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Engine { get; set; } = "html";
        public string PaperSize { get; set; } = "A6";
        public string Orientation { get; set; } = "Portrait";
        public string Content { get; set; } = string.Empty;
        public string? ProductKey { get; set; }
        public string? CustomerKey { get; set; }
        public List<LabelTemplateComponent>? Components { get; set; }
    }

    public class PrintJobMessage
    {
        public long JobID { get; set; }
        public string BatchNo { get; set; } = string.Empty;
        public int TemplateID { get; set; }
        public int Copies { get; set; } = 1;
    }

    public record PrintResponse(
        bool Success,
        string? Message,
        int? JobId
    );
} 