namespace Models;
public record LabelTemplate(
    int TemplateID,
    string Name,
    string? Description,
    string Engine,
    string PaperSize,
    string Orientation,
    string Content,
    int Version,
    bool Active,
    DateTime CreatedAt,
    DateTime UpdatedAt
);