namespace FgLabel.Api.Models;

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