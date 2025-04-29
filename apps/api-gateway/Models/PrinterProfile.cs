namespace Models;
public record PrinterProfile(
    int PrinterID,
    string Name,
    string? Description,
    string? Location,
    string? Model,
    int? Dpi,
    string CommandSet,
    bool IsDefault,
    bool Active,
    DateTime CreatedAt
);