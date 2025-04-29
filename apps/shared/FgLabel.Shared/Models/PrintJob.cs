namespace FgLabel.Shared.Models;

public class PrintJob
{
    public int Id { get; set; }
    public string BatchNo { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public List<string> Items { get; set; } = new();
    public int Copies { get; set; }
    public DateTime PrintedAt { get; set; }
} 