using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using FgLabel.Api.Models;
using FgLabel.Api.Services;
using System.Data;
using Dapper;

namespace FgLabel.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TemplateController : ControllerBase
    {
        private readonly ITemplateService _templateService;
        private readonly ILogger<TemplateController> _logger;
        private readonly IDbConnection _connection;
        
        public TemplateController(
            ITemplateService templateService,
            ILogger<TemplateController> logger,
            IDbConnection connection)
        {
            _templateService = templateService;
            _logger = logger;
            _connection = connection;
        }
        
        /// <summary>
        /// Get template by batch number or create if not exists
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetByBatch([FromQuery] string batchNo)
        {
            try
            {
                if (string.IsNullOrEmpty(batchNo))
                {
                    return BadRequest(new { error = "Batch number is required" });
                }
                
                var template = await _templateService.GetOrCreateByBatch(batchNo);
                
                if (template == null)
                {
                    return NotFound(new { error = "Batch data not found or template creation failed" });
                }
                
                return Ok(template);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting or creating template for batch {BatchNo}", batchNo);
                return StatusCode(500, new { error = "An error occurred while processing your request" });
            }
        }
        
        /// <summary>
        /// Update existing template
        /// </summary>
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] TemplateUpdateDto dto)
        {
            try
            {
                if (id <= 0 || dto == null)
                {
                    return BadRequest(new { error = "Invalid template data" });
                }
                
                var success = await _templateService.UpdateTemplate(id, dto);
                
                if (!success)
                {
                    return NotFound(new { error = "Template not found or update failed" });
                }
                
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating template {TemplateId}", id);
                return StatusCode(500, new { error = "An error occurred while updating the template" });
            }
        }
        
        /// <summary>
        /// Get template by id
        /// </summary>
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var template = await _templateService.GetTemplateById(id);
                
                if (template == null)
                {
                    return NotFound(new { error = "Template not found" });
                }
                
                return Ok(template);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting template {TemplateId}", id);
                return StatusCode(500, new { error = "An error occurred while retrieving the template" });
            }
        }
        
        /// <summary>
        /// Lookup template by product and customer keys
        /// </summary>
        [HttpGet("lookup")]
        public async Task<IActionResult> Lookup([FromQuery] string? productKey, [FromQuery] string? customerKey, [FromQuery] string? labelType)
        {
            try
            {
                if (string.IsNullOrEmpty(productKey) && string.IsNullOrEmpty(customerKey))
                {
                    return BadRequest(new { error = "At least one of productKey or customerKey must be provided" });
                }
                
                // ใช้ค่า labelType ที่รับมา ถ้าไม่มีให้ใช้ค่าเริ่มต้นเป็น Standard
                string templateType = !string.IsNullOrEmpty(labelType) ? labelType : "Standard";
                
                _logger.LogInformation(
                    "Looking up template with productKey={ProductKey}, customerKey={CustomerKey}, templateType={TemplateType}", 
                    productKey ?? "(null)", 
                    customerKey ?? "(null)", 
                    templateType);
                
                // เรียกใช้ stored procedure เพื่อค้นหา template
                var result = await _connection.QueryFirstOrDefaultAsync<dynamic>(
                    "FgL.GetTemplateByProductAndCustomerKeys",
                    new { productKey, customerKey, templateType },
                    commandType: CommandType.StoredProcedure
                );
                
                // ถ้าไม่พบ template
                if (result == null || result?.TemplateID == null)
                {
                    _logger.LogWarning(
                        "No template found for productKey={ProductKey}, customerKey={CustomerKey}, templateType={TemplateType}", 
                        productKey ?? "(null)", 
                        customerKey ?? "(null)", 
                        templateType);
                    return NotFound(new { error = $"No template found for the specified product and customer keys with type {templateType}" });
                }
                
                // ปรับเปลี่ยนจาก dynamic เป็น string เพื่อแก้ไขปัญหา LogInformation กับ dynamic argument
                string templateIdStr = result?.TemplateID?.ToString() ?? "null";
                _logger.LogInformation("Found template ID: {TemplateID}", templateIdStr);
                return Ok(new { templateID = result?.TemplateID });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error looking up template by product key {ProductKey}, customer key {CustomerKey}, and label type {LabelType}", 
                    productKey ?? "(null)", 
                    customerKey ?? "(null)",
                    labelType ?? "Standard");
                return StatusCode(500, new { error = "An error occurred while looking up the template" });
            }
        }
    }
} 