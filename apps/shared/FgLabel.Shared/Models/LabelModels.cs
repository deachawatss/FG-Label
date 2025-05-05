namespace FgLabel.Shared.Models;

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

public class AutoCreateRequest
{
    public string ProductKey { get; set; } = string.Empty;
    public string CustomerKey { get; set; } = string.Empty;
}

public class BatchDto
{
    public string BatchNo { get; set; } = string.Empty;
    public string? ProductKey { get; set; }
    public string? CustomerKey { get; set; }
    public DateTime ProductionDate { get; set; }
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
}

public record LabelTemplate
{
    public int TemplateID { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string Engine { get; init; } = "html";
    public string PaperSize { get; init; } = "A6";
    public string Orientation { get; init; } = "Portrait";
    public string Content { get; init; } = string.Empty;
    public string? ProductKey { get; init; }
    public string? CustomerKey { get; init; }
    public int Version { get; init; } = 1;
    public bool Active { get; init; } = true;
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public List<LabelTemplateComponent> Components { get; init; } = new();
}

public record LabelTemplateComponent
{
    public int ComponentID { get; init; }
    public int TemplateID { get; init; }
    public string ComponentType { get; init; } = string.Empty;
    public decimal X { get; init; }
    public decimal Y { get; init; }
    public decimal? W { get; init; }
    public decimal? H { get; init; }
    public string? FontName { get; init; }
    public int? FontSize { get; init; }
    public string? Placeholder { get; init; }
    public string? StaticText { get; init; }
    public string? BarcodeFormat { get; init; }
    public DateTime CreatedAt { get; init; }
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
}

public record LoginRequest(string username, string password);
public record JobRequest(string BatchNo, int TemplateId, int Copies); 