using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using FgLabel.Api.Models;
using FgLabel.Api.Services;

namespace FgLabel.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PrintController : ControllerBase
    {
        private readonly IPrintService _printService;
        private readonly ILogger<PrintController> _logger;
        
        public PrintController(
            IPrintService printService,
            ILogger<PrintController> logger)
        {
            _printService = printService;
            _logger = logger;
        }
        
        /// <summary>
        /// สร้างงานพิมพ์ใหม่
        /// </summary>
        [HttpPost("job")]
        public async Task<IActionResult> CreatePrintJob([FromBody] PrintJobRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }
                
                int jobId = await _printService.CreatePrintJobAsync(
                    request.BatchNo,
                    request.TemplateId,
                    request.Copies,
                    request.BagNo,
                    request.StartBag,
                    request.EndBag,
                    request.PrinterId,
                    request.SpecialLabels);
                
                return Ok(new { JobId = jobId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating print job");
                return StatusCode(500, new { Error = "เกิดข้อผิดพลาดในการสร้างงานพิมพ์" });
            }
        }
        
        /// <summary>
        /// ดึงสถานะของงานพิมพ์ทั้งหมดสำหรับแบทช์ที่ระบุ
        /// </summary>
        [HttpGet("jobs/{batchNo}")]
        public async Task<IActionResult> GetPrintJobStatuses(string batchNo)
        {
            try
            {
                var jobs = await _printService.GetPrintJobStatusesAsync(batchNo);
                
                // แปลงข้อมูลให้เป็นรูปแบบที่ต้องการส่งกลับไปยัง client
                var result = jobs.Select(job => new
                {
                    PrintJobID = job["PrintJobID"],
                    BatchNo = job["BatchNo"],
                    BagNo = job["BagNo"],
                    StartBagNo = job["StartBagNo"],
                    EndBagNo = job["EndBagNo"],
                    TemplateID = job["TemplateID"],
                    PrinterID = job["PrinterID"],
                    PrintQuantity = job["PrintQuantity"],
                    PrintStatus = job["PrintStatus"],
                    ErrorMessage = job["ErrorMessage"],
                    ParentJobID = job["ParentJobID"],
                    RequestedDate = job["RequestedDate"],
                    StartDate = job["StartDate"],
                    CompletedDate = job["CompletedDate"]
                });
                
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting print job statuses for batch {BatchNo}", batchNo);
                return StatusCode(500, new { Error = "เกิดข้อผิดพลาดในการดึงข้อมูลสถานะงานพิมพ์" });
            }
        }
        
        /// <summary>
        /// ยกเลิกงานพิมพ์
        /// </summary>
        [HttpDelete("job/{jobId}")]
        public async Task<IActionResult> CancelPrintJob(int jobId)
        {
            try
            {
                bool success = await _printService.CancelPrintJobAsync(jobId);
                
                if (!success)
                {
                    return NotFound(new { Error = "ไม่พบงานพิมพ์หรือไม่สามารถยกเลิกได้" });
                }
                
                return Ok(new { Message = "ยกเลิกงานพิมพ์เรียบร้อย" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cancelling print job {JobId}", jobId);
                return StatusCode(500, new { Error = "เกิดข้อผิดพลาดในการยกเลิกงานพิมพ์" });
            }
        }
        
        /// <summary>
        /// ประมวลผลงานพิมพ์ด้วยตนเอง (สำหรับกรณีที่งานไม่ได้ถูกประมวลผลโดยอัตโนมัติ)
        /// </summary>
        [HttpPost("job/{jobId}/process")]
        public async Task<IActionResult> ProcessPrintJob(int jobId)
        {
            try
            {
                bool success = await _printService.ProcessPrintJobAsync(jobId);
                
                if (!success)
                {
                    return BadRequest(new { Error = "ไม่สามารถประมวลผลงานพิมพ์ได้" });
                }
                
                return Ok(new { Message = "งานพิมพ์กำลังถูกประมวลผล" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing print job {JobId}", jobId);
                return StatusCode(500, new { Error = "เกิดข้อผิดพลาดในการประมวลผลงานพิมพ์" });
            }
        }
    }
} 