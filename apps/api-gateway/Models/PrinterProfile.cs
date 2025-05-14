namespace FgLabel.Api.Models;

/// <summary>
/// ข้อมูลเครื่องพิมพ์สำหรับการพิมพ์ฉลาก
/// </summary>
public record PrinterProfile(
    int PrinterID,
    string Name,
    string? Description,
    string? Location,
    string? IPAddress,
    string? PrinterType,
    string? CommandSet,
    bool IsDefault,
    bool Active,
    DateTime CreatedAt
);