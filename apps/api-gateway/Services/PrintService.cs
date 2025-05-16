using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using FgLabel.Api.Models;
using FgLabel.Api.Integration.LabelRenderers;

namespace FgLabel.Api.Services
{
    /// <summary>
    /// บริการสำหรับการจัดการและประมวลผลงานพิมพ์
    /// </summary>
    public class PrintService : IPrintService
    {
        private readonly string _connectionString;
        private readonly ILogger<PrintService> _logger;
        private readonly FgLabel.Api.Integration.LabelRenderers.LabelRendererFactory _rendererFactory;
        
        public PrintService(
            IConfiguration configuration,
            ILogger<PrintService> logger,
            FgLabel.Api.Integration.LabelRenderers.LabelRendererFactory rendererFactory)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection") 
                ?? throw new InvalidOperationException("DefaultConnection is missing in configuration");
            _logger = logger;
            _rendererFactory = rendererFactory;
        }
        
        /// <summary>
        /// สร้างงานพิมพ์ใหม่และส่งไปประมวลผลแบบอะซิงโครนัส
        /// </summary>
        public async Task<int> CreatePrintJobAsync(
            string batchNo, 
            int templateId, 
            int copies = 1, 
            string? bagNo = null,
            int? startBag = null,
            int? endBag = null,
            int? printerId = null,
            string[]? specialLabels = null)
        {
            _logger.LogInformation("Creating print job for batch {BatchNo}, template {TemplateId}, copies {Copies}", 
                batchNo, templateId, copies);
            
            try
            {
                using var connection = new SqlConnection(_connectionString);
                await connection.OpenAsync();
                
                // ตรวจสอบว่า Template มีอยู่จริง
                var template = await connection.QueryFirstOrDefaultAsync<LabelTemplateClass>(
                    "SELECT * FROM FgL.LabelTemplate WHERE TemplateID = @TemplateId AND Active = 1", 
                    new { TemplateId = templateId });
                
                if (template == null)
                {
                    _logger.LogWarning("Template {TemplateId} not found or not active", templateId);
                    throw new KeyNotFoundException($"Template {templateId} not found or is not active");
                }
                
                // ดึงข้อมูล Batch
                var batchData = await connection.QueryFirstOrDefaultAsync<Dictionary<string, object>>(
                    "SELECT * FROM FgL.LabelBatch WHERE BatchNo = @BatchNo", 
                    new { BatchNo = batchNo });
                
                if (batchData == null)
                {
                    _logger.LogWarning("Batch {BatchNo} not found", batchNo);
                    throw new KeyNotFoundException($"Batch {batchNo} not found");
                }
                
                int jobId;

                // ถ้ามีการระบุช่วงถุง (startBag, endBag) ให้สร้างงานพิมพ์สำหรับช่วงนั้น
                if (startBag.HasValue && endBag.HasValue && startBag.Value <= endBag.Value)
                {
                    // สร้าง job สำหรับช่วงถุง
                    jobId = await connection.QuerySingleAsync<int>(@"
                        INSERT INTO FgL.LabelPrintJob (BatchNo, TemplateID, PrinterID, Copies, Status, RequestedDate, 
                            StartBagNo, EndBagNo)
                        VALUES (@BatchNo, @TemplateID, @PrinterID, @Copies, 'queued', GETDATE(),
                            @StartBagNo, @EndBagNo);
                        SELECT CAST(SCOPE_IDENTITY() as int)", 
                        new { 
                            BatchNo = batchNo, 
                            TemplateID = templateId, 
                            PrinterID = printerId, 
                            Copies = copies,
                            StartBagNo = startBag.Value,
                            EndBagNo = endBag.Value
                        });
                }
                else
                {
                    // สร้างงานพิมพ์ปกติสำหรับถุงเดียว
                    jobId = await connection.QuerySingleAsync<int>(@"
                        INSERT INTO FgL.LabelPrintJob (BatchNo, TemplateID, PrinterID, Copies, Status, RequestedDate, 
                            BagNo)
                        VALUES (@BatchNo, @TemplateID, @PrinterID, @Copies, 'queued', GETDATE(),
                            @BagNo);
                        SELECT CAST(SCOPE_IDENTITY() as int)", 
                        new { 
                            BatchNo = batchNo, 
                            TemplateID = templateId, 
                            PrinterID = printerId, 
                            Copies = copies,
                            BagNo = bagNo
                        });
                }
                
                // สร้างงานพิมพ์สำหรับฉลากพิเศษถ้าต้องการ
                if (specialLabels != null && specialLabels.Length > 0)
                {
                    foreach (var label in specialLabels)
                    {
                        string specialBatchNo = $"{batchNo}-{label.ToUpper()}";
                        
                        await connection.ExecuteAsync(@"
                            INSERT INTO FgL.LabelPrintJob (BatchNo, TemplateID, PrinterID, Copies, Status, RequestedDate)
                            VALUES (@BatchNo, @TemplateID, @PrinterID, 1, 'queued', GETDATE());", 
                            new { 
                                BatchNo = specialBatchNo, 
                                TemplateID = templateId, 
                                PrinterID = printerId
                            });
                    }
                }
                
                _logger.LogInformation("Created print job {JobId} for batch {BatchNo}", jobId, batchNo);
                
                // เริ่มประมวลผลงานพิมพ์แบบไม่บล็อก
                _ = ProcessPrintJobAsync(jobId);
                
                return jobId;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating print job for batch {BatchNo}", batchNo);
                throw;
            }
        }
        
        /// <summary>
        /// ประมวลผลงานพิมพ์ โดยดึงข้อมูลจากฐานข้อมูลและสร้างเอกสาร PDF
        /// </summary>
        public async Task<bool> ProcessPrintJobAsync(int jobId)
        {
            _logger.LogInformation("Processing print job {JobId}", jobId);
            
            try
            {
                using var connection = new SqlConnection(_connectionString);
                await connection.OpenAsync();
                
                // ดึงข้อมูลงานพิมพ์
                var printJob = await connection.QueryFirstOrDefaultAsync<Dictionary<string, object>>(@"
                    SELECT * FROM FgL.LabelPrintJob WHERE JobID = @JobId",
                    new { JobId = jobId });
                
                if (printJob == null)
                {
                    _logger.LogWarning("Print job {JobId} not found", jobId);
                    return false;
                }
                
                // อัพเดทสถานะเป็นกำลังประมวลผล
                await connection.ExecuteAsync(@"
                    UPDATE FgL.LabelPrintJob 
                    SET Status = 'processing', PrintedAt = GETDATE()
                    WHERE JobID = @JobId",
                    new { JobId = jobId });
                
                // ดึงข้อมูล Template
                var templateId = printJob.TryGetValue("TemplateID", out var templateIdObj) ? Convert.ToInt32(templateIdObj) : 0;
                var template = await connection.QueryFirstOrDefaultAsync<LabelTemplateClass>(@"
                    SELECT * FROM FgL.LabelTemplate WHERE TemplateID = @TemplateId",
                    new { TemplateId = templateId });
                
                if (template == null)
                {
                    _logger.LogWarning("Template {TemplateId} not found for job {JobId}", templateId, jobId);
                    
                    // อัปเดตสถานะเป็นล้มเหลว
                    await connection.ExecuteAsync(@"
                        UPDATE FgL.LabelPrintJob 
                        SET Status = 'failed', ErrorMessage = 'Template not found'
                        WHERE JobID = @JobId",
                        new { JobId = jobId });
                    
                    return false;
                }
                
                // ดึงข้อมูลเครื่องพิมพ์
                var printerId = printJob.TryGetValue("PrinterID", out var printerIdObj) ? (int?)Convert.ToInt32(printerIdObj) : null;
                PrinterProfile? printer = null;
                if (printerId.HasValue)
                {
                    printer = await GetPrinterForJobAsync(printerId);
                }
                
                // ดึงข้อมูล Batch
                var batchNo = printJob.TryGetValue("BatchNo", out var batchNoObj) ? batchNoObj?.ToString() : string.Empty;
                var batchData = await connection.QueryFirstOrDefaultAsync<Dictionary<string, object>>(@"
                    SELECT * FROM FgL.LabelBatch WHERE BatchNo = @BatchNo",
                    new { BatchNo = batchNo });
                
                if (batchData == null)
                {
                    _logger.LogWarning("Batch {BatchNo} not found for job {JobId}", batchNo, jobId);
                    
                    // อัปเดตสถานะเป็นล้มเหลว
                    await connection.ExecuteAsync(@"
                        UPDATE FgL.LabelPrintJob 
                        SET Status = 'failed', ErrorMessage = 'Batch data not found'
                        WHERE JobID = @JobId",
                        new { JobId = jobId });
                    
                    return false;
                }
                
                // สร้าง PDF สำหรับฉลาก
                try 
                {
                    // ตรวจสอบว่าเป็นงานพิมพ์แบบช่วงถุงหรือไม่
                    var bagNo = printJob.TryGetValue("BagNo", out var bagNoObj) ? bagNoObj?.ToString() : null;
                    var startBagNo = printJob.TryGetValue("StartBagNo", out var startBagNoObj) ? Convert.ToInt32(startBagNoObj) : (int?)null;
                    var endBagNo = printJob.TryGetValue("EndBagNo", out var endBagNoObj) ? Convert.ToInt32(endBagNoObj) : (int?)null;
                    
                    // จำนวน Copies 
                    var copies = printJob.TryGetValue("Copies", out var copiesObj) ? Convert.ToInt32(copiesObj) : 1;
                    
                    if (startBagNo.HasValue && endBagNo.HasValue)
                    {
                        // พิมพ์หลายถุงในช่วงที่กำหนด
                        for (int currentBag = startBagNo.Value; currentBag <= endBagNo.Value; currentBag++)
                        {
                            // ดึงข้อมูลถุง
                            var bagData = await connection.QueryFirstOrDefaultAsync<Dictionary<string, object>>(@"
                                SELECT * FROM FgL.LabelBag 
                                WHERE BatchNo = @BatchNo AND BagNo = @BagNo",
                                new { BatchNo = batchNo, BagNo = currentBag.ToString().PadLeft(6, '0') });
                            
                            if (bagData != null)
                            {
                                // สร้าง PDF สำหรับถุงนี้
                                for (int i = 0; i < copies; i++)
                                {
                                    var labelData = MergeLabelData(batchData, bagData);
                                    var pdfBytes = RenderLabel(template, labelData);
                                    
                                    // บันทึก PDF หรือส่งไปยังเครื่องพิมพ์ตามการกำหนดค่า
                                    await SavePdfAsync(batchNo, currentBag.ToString(), pdfBytes);
                                    
                                    if (printer != null)
                                    {
                                        await PrintLabelAsync(printer, pdfBytes);
                                    }
                                }
                            }
                        }
                    }
                    else if (!string.IsNullOrEmpty(bagNo))
                    {
                        // พิมพ์เฉพาะถุงที่กำหนด
                        var bagData = await connection.QueryFirstOrDefaultAsync<Dictionary<string, object>>(@"
                            SELECT * FROM FgL.LabelBag 
                            WHERE BatchNo = @BatchNo AND BagNo = @BagNo",
                            new { BatchNo = batchNo, BagNo = bagNo });
                        
                        if (bagData != null)
                        {
                            // สร้าง PDF สำหรับถุงนี้
                            for (int i = 0; i < copies; i++)
                            {
                                var labelData = MergeLabelData(batchData, bagData);
                                var pdfBytes = RenderLabel(template, labelData);
                                
                                // บันทึก PDF หรือส่งไปยังเครื่องพิมพ์ตามการกำหนดค่า
                                await SavePdfAsync(batchNo, bagNo, pdfBytes);
                                
                                if (printer != null)
                                {
                                    await PrintLabelAsync(printer, pdfBytes);
                                }
                            }
                        }
                    }
                    else
                    {
                        // พิมพ์ฉลากโดยไม่ระบุถุง (เช่น ฉลากพิเศษ)
                        for (int i = 0; i < copies; i++)
                        {
                            var pdfBytes = RenderLabel(template, batchData);
                            
                            // บันทึก PDF หรือส่งไปยังเครื่องพิมพ์ตามการกำหนดค่า
                            await SavePdfAsync(batchNo, "SPECIAL", pdfBytes);
                            
                            if (printer != null)
                            {
                                await PrintLabelAsync(printer, pdfBytes);
                            }
                        }
                    }
                    
                    // อัปเดตสถานะเป็นสำเร็จ
                    await connection.ExecuteAsync(@"
                        UPDATE FgL.LabelPrintJob 
                        SET Status = 'completed'
                        WHERE JobID = @JobId",
                        new { JobId = jobId });
                    
                    _logger.LogInformation("Print job {JobId} processed successfully", jobId);
                    return true;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error processing print job {JobId}", jobId);
                    
                    // อัปเดตสถานะเป็นล้มเหลว
                    await connection.ExecuteAsync(@"
                        UPDATE FgL.LabelPrintJob 
                        SET Status = 'failed', ErrorMessage = @ErrorMessage
                        WHERE JobID = @JobId",
                        new { JobId = jobId, ErrorMessage = ex.Message });
                    
                    return false;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing print job {JobId}", jobId);
                return false;
            }
        }
        
        /// <summary>
        /// รวมข้อมูลจาก batch และ bag สำหรับใช้กับเทมเพลต
        /// </summary>
        private Dictionary<string, object> MergeLabelData(Dictionary<string, object> batchData, Dictionary<string, object> bagData)
        {
            var result = new Dictionary<string, object>();
            
            // คัดลอกข้อมูลจาก batch
            foreach (var item in batchData)
            {
                result[item.Key] = item.Value;
            }
            
            // คัดลอกและเพิ่มเติมข้อมูลจาก bag (ทับข้อมูลเดิมถ้ามี)
            foreach (var item in bagData)
            {
                result[item.Key] = item.Value;
            }
            
            return result;
        }
        
        /// <summary>
        /// สร้างไฟล์ PDF จากเทมเพลตและข้อมูล
        /// </summary>
        private byte[] RenderLabel(LabelTemplateClass template, Dictionary<string, object> data)
        {
            try 
            {
                string engineType = template.Engine ?? "ZPL";
                
                // แปลง Dictionary เป็น JSON แล้วแปลงกลับเป็น object
                string jsonData = System.Text.Json.JsonSerializer.Serialize(data);
                var labelData = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(jsonData);
                
                // ใช้ renderer ที่เหมาะสมกับประเภทของ template
                var renderer = _rendererFactory.GetRenderer(engineType);
                
                // ประมวลผล template
                string renderedContent = renderer.ProcessTemplate(template.Content, labelData);
                
                // แปลงเป็น byte array
                byte[] labelBytes = renderer.RenderLabel(renderedContent);
                
                return labelBytes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error rendering label: {Message}", ex.Message);
                throw;
            }
        }
        
        /// <summary>
        /// บันทึก PDF ลงในฐานข้อมูลหรือไฟล์
        /// </summary>
        private async Task SavePdfAsync(string? batchNo, string? bagNo, byte[] labelData)
        {
            // กำหนดค่าเริ่มต้นถ้าเป็น null
            batchNo = batchNo ?? "unknown_batch";
            bagNo = bagNo ?? "unknown_bag";
            
            // ตัวอย่างการบันทึกเป็นไฟล์ (สามารถเปลี่ยนเป็นบันทึกลงฐานข้อมูลได้)
            var outputDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "labels", batchNo);
            Directory.CreateDirectory(outputDir);
            
            var fileName = $"{batchNo}_{bagNo}_{DateTime.Now:yyyyMMdd_HHmmss}.prn";
            var outputPath = Path.Combine(outputDir, fileName);
            
            await File.WriteAllBytesAsync(outputPath, labelData);
            _logger.LogInformation("Saved label data to {Path}", outputPath);
        }
        
        /// <summary>
        /// ส่งข้อมูลไปยังเครื่องพิมพ์
        /// </summary>
        private async Task<bool> PrintLabelAsync(PrinterProfile printer, byte[] labelData)
        {
            try
            {
                if (string.IsNullOrEmpty(printer.IPAddress))
                {
                    _logger.LogWarning("Printer {PrinterName} does not have an IP address", printer.Name);
                    return false;
                }
                
                string printerType = printer.PrinterType ?? "Zebra";
                
                // ใช้ renderer ที่เหมาะสมกับประเภทเครื่องพิมพ์
                var renderer = _rendererFactory.GetRenderer(printerType);
                
                // ส่งข้อมูลไปยังเครื่องพิมพ์
                await renderer.SendToPrinterAsync(printer.IPAddress, labelData);
                
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending to printer {PrinterName}: {Message}", 
                    printer.Name, ex.Message);
                return false;
            }
        }
        
        /// <summary>
        /// ดึงสถานะของงานพิมพ์ทั้งหมดสำหรับหมายเลขแบทช์ที่ระบุ
        /// </summary>
        public async Task<IEnumerable<Dictionary<string, object>>> GetPrintJobStatusesAsync(string batchNo)
        {
            try
            {
                _logger.LogInformation("Getting print job statuses for batch {BatchNo}", batchNo);
                
                using var connection = new SqlConnection(_connectionString);
                await connection.OpenAsync();
                
                var jobs = await connection.QueryAsync(@"
                    SELECT * FROM FgL.LabelPrintJob 
                    WHERE BatchNo = @BatchNo OR BatchNo LIKE @BatchPattern
                    ORDER BY RequestedDate DESC",
                    new { 
                        BatchNo = batchNo,
                        BatchPattern = $"{batchNo}-%"  // รวมฉลากพิเศษด้วย (BatchNo-SPECIAL)
                    });
                
                var result = new List<Dictionary<string, object>>();
                
                foreach (dynamic job in jobs)
                {
                    var jobDict = new Dictionary<string, object>();
                    
                    // แปลงข้อมูลจาก dynamic ให้เป็น Dictionary
                    foreach (var prop in ((IDictionary<string, object>)job))
                    {
                        jobDict[prop.Key] = prop.Value;
                    }
                    
                    result.Add(jobDict);
                }
                
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting print job statuses for batch {BatchNo}", batchNo);
                return Enumerable.Empty<Dictionary<string, object>>();
            }
        }
        
        /// <summary>
        /// ยกเลิกงานพิมพ์ตามรหัสงาน
        /// </summary>
        public async Task<bool> CancelPrintJobAsync(int jobId)
        {
            try
            {
                _logger.LogInformation("Cancelling print job {JobId}", jobId);
                
                using var connection = new SqlConnection(_connectionString);
                await connection.OpenAsync();
                
                // ตรวจสอบว่างานพิมพ์มีอยู่หรือไม่
                var job = await connection.QueryFirstOrDefaultAsync<Dictionary<string, object>>(@"
                    SELECT * FROM FgL.LabelPrintJob WHERE JobID = @JobId",
                    new { JobId = jobId });
                
                if (job == null)
                {
                    _logger.LogWarning("Print job {JobId} not found for cancellation", jobId);
                    return false;
                }
                
                // ตรวจสอบว่าสถานะปัจจุบันอนุญาตให้ยกเลิกหรือไม่
                string status = job.TryGetValue("Status", out var statusObj) ? statusObj?.ToString() ?? "" : "";
                if (status == "completed" || status == "cancelled" || status == "failed")
                {
                    _logger.LogWarning("Cannot cancel print job {JobId} with status {Status}", jobId, status);
                    return false;
                }
                
                // ยกเลิกงานพิมพ์
                int affected = await connection.ExecuteAsync(@"
                    UPDATE FgL.LabelPrintJob 
                    SET Status = 'cancelled', 
                        CompletedAt = GETDATE(),
                        ErrorMessage = 'Cancelled by user'
                    WHERE JobID = @JobId 
                      AND Status IN ('queued', 'processing')",
                    new { JobId = jobId });
                
                if (affected == 0)
                {
                    _logger.LogWarning("Print job {JobId} could not be cancelled or was already in a final state", jobId);
                    return false;
                }
                
                _logger.LogInformation("Print job {JobId} has been cancelled", jobId);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cancelling print job {JobId}", jobId);
                return false;
            }
        }
        
        /// <summary>
        /// ดึงข้อมูล Printer สำหรับงานพิมพ์ของฉลาก
        /// </summary>
        private async Task<PrinterProfile?> GetPrinterForJobAsync(int? printerID)
        {
            if (printerID == null) return null;
            
            try
            {
                using var connection = new SqlConnection(_connectionString);
                await connection.OpenAsync();
                
                return await connection.QueryFirstOrDefaultAsync<PrinterProfile>(
                    "SELECT * FROM FgL.Printer WHERE PrinterID = @PrinterID",
                    new { PrinterID = printerID });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting printer {PrinterID}", printerID);
                return null;
            }
        }
    }
} 