using System.Collections.Generic;
using System.Threading.Tasks;
using FgLabel.Api.Models;

namespace FgLabel.Api.Services
{
    /// <summary>
    /// บริการสำหรับการจัดการและประมวลผลงานพิมพ์
    /// </summary>
    public interface IPrintService
    {
        /// <summary>
        /// สร้างงานพิมพ์ใหม่และส่งไปประมวลผลแบบอะซิงโครนัส
        /// </summary>
        /// <param name="batchNo">หมายเลขแบตช์</param>
        /// <param name="templateId">รหัสเทมเพลต</param>
        /// <param name="copies">จำนวนสำเนา</param>
        /// <param name="bagNo">หมายเลขถุง (ถ้ามี)</param>
        /// <param name="startBag">หมายเลขถุงเริ่มต้น (สำหรับการพิมพ์หลายถุง)</param>
        /// <param name="endBag">หมายเลขถุงสุดท้าย (สำหรับการพิมพ์หลายถุง)</param>
        /// <param name="printerId">รหัสเครื่องพิมพ์ (ถ้ามี)</param>
        /// <param name="specialLabels">รายการฉลากพิเศษที่ต้องการพิมพ์ (QC, Form Sheet, Pallet)</param>
        Task<int> CreatePrintJobAsync(
            string batchNo, 
            int templateId, 
            int copies = 1, 
            string? bagNo = null,
            int? startBag = null,
            int? endBag = null,
            int? printerId = null,
            string[]? specialLabels = null);
            
        /// <summary>
        /// ประมวลผลงานพิมพ์ที่สร้างไว้แล้ว
        /// </summary>
        /// <param name="jobId">รหัสงานพิมพ์</param>
        /// <returns>ผลลัพธ์การประมวลผล (สำเร็จ/ไม่สำเร็จ)</returns>
        Task<bool> ProcessPrintJobAsync(int jobId);
        
        /// <summary>
        /// ดึงข้อมูลสถานะงานพิมพ์ของแบตช์
        /// </summary>
        /// <param name="batchNo">หมายเลขแบตช์</param>
        /// <returns>รายการสถานะงานพิมพ์</returns>
        Task<IEnumerable<Dictionary<string, object>>> GetPrintJobStatusesAsync(string batchNo);
        
        /// <summary>
        /// ยกเลิกงานพิมพ์
        /// </summary>
        /// <param name="jobId">รหัสงานพิมพ์</param>
        /// <returns>ผลลัพธ์การยกเลิก (สำเร็จ/ไม่สำเร็จ)</returns>
        Task<bool> CancelPrintJobAsync(int jobId);
    }
} 