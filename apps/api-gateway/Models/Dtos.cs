using System;

namespace FgLabel.Api.Models
{
    public class BatchDto
    {
        public string BatchNo { get; set; } = string.Empty;
        public string? ProductKey { get; set; }
        public string? CustomerKey { get; set; }
        public DateTime ProductionDate { get; set; }
    }

    public class AutoCreateRequest
    {
        public string ProductKey { get; set; } = string.Empty;
        public string CustomerKey { get; set; } = string.Empty;
    }

    public class JobRequest
    {
        public string BatchNo { get; set; } = string.Empty;
        public int Copies { get; set; }
    }
}