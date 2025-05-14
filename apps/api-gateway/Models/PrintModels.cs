using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace FgLabel.Api.Models
{
    /// <summary>
    /// คำขอสร้างงานพิมพ์
    /// </summary>
    public class PrintJobRequest
    {
        /// <summary>
        /// รหัสแบทช์ (จำเป็นต้องระบุ)
        /// </summary>
        [Required(ErrorMessage = "กรุณาระบุรหัสแบทช์")]
        public string BatchNo { get; set; } = string.Empty;
        
        /// <summary>
        /// รหัสเทมเพลต (จำเป็นต้องระบุ)
        /// </summary>
        [Required(ErrorMessage = "กรุณาระบุรหัสเทมเพลต")]
        public int TemplateId { get; set; }
        
        /// <summary>
        /// จำนวนสำเนา (ค่าเริ่มต้น = 1)
        /// </summary>
        [Range(1, 100, ErrorMessage = "จำนวนสำเนาต้องอยู่ระหว่าง 1-100")]
        public int Copies { get; set; } = 1;
        
        /// <summary>
        /// รหัสถุง (ถ้าต้องการพิมพ์เฉพาะถุง)
        /// </summary>
        public string? BagNo { get; set; }
        
        /// <summary>
        /// ถุงเริ่มต้น (ถ้าต้องการพิมพ์เป็นช่วง)
        /// </summary>
        public int? StartBag { get; set; }
        
        /// <summary>
        /// ถุงสุดท้าย (ถ้าต้องการพิมพ์เป็นช่วง)
        /// </summary>
        public int? EndBag { get; set; }
        
        /// <summary>
        /// รหัสเครื่องพิมพ์ (ถ้าไม่ระบุจะใช้เครื่องพิมพ์เริ่มต้น)
        /// </summary>
        public int? PrinterId { get; set; }
        
        /// <summary>
        /// รายการฉลากพิเศษ เช่น ["SPECIAL", "QC", "SAMPLE"]
        /// </summary>
        public string[]? SpecialLabels { get; set; }
    }
} 