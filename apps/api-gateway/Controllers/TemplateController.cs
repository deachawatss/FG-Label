using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using FgLabel.Api.Models;
using FgLabel.Api.Services;

namespace FgLabel.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TemplateController : ControllerBase
    {
        private readonly ITemplateService _templateService;
        private readonly ILogger<TemplateController> _logger;
        
        public TemplateController(
            ITemplateService templateService,
            ILogger<TemplateController> logger)
        {
            _templateService = templateService;
            _logger = logger;
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
    }
} 