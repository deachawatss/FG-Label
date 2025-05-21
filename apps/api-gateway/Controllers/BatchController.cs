using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using FgLabel.Api.Repositories;
using FgLabel.Api.Models;

namespace FgLabel.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class BatchController : ControllerBase
    {
        private readonly IBatchRepository _batchRepository;
        private readonly IConfiguration _configuration;
        private readonly ILogger<BatchController> _logger;
        private readonly string? _connectionString;

        public BatchController(IBatchRepository batchRepository, IConfiguration configuration, ILogger<BatchController> logger)
        {
            _batchRepository = batchRepository;
            _configuration = configuration;
            _logger = logger;
            _connectionString = configuration.GetConnectionString("BMSSQL") ?? string.Empty;
        }

        [HttpGet("{batchNo}")]
        public async Task<ActionResult<LabelRowDto>> GetBatchInfo(string batchNo, [FromQuery] string? bagNo = null)
        {
            var batchInfo = await _batchRepository.GetBatchPrintData(batchNo, bagNo);
            if (batchInfo == null)
            {
                return NotFound();
            }

            return Ok(batchInfo);
        }

        [HttpGet("sqlview")]
        public async Task<IActionResult> GetBatchSqlViewData([FromQuery] string batchNo)
        {
            try
            {
                if (string.IsNullOrEmpty(batchNo))
                {
                    return BadRequest("Parameter batchNo is required");
                }

                _logger.LogInformation($"Fetching data directly from SQL View for batchNo: {batchNo}");

                var results = new List<IDictionary<string, object>>();

                if (string.IsNullOrEmpty(_connectionString))
                {
                    return StatusCode(500, "Connection string is not configured properly");
                }

                using (var connection = new SqlConnection(_connectionString))
                {
                    await connection.OpenAsync();

                    string sql = @"
                        SELECT * FROM FgL.vw_Label_PrintSummary 
                        WHERE BatchNo = @BatchNo
                        ORDER BY ItemKey, CustKey";

                    using (var command = new SqlCommand(sql, connection))
                    {
                        command.Parameters.AddWithValue("@BatchNo", batchNo);

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            while (await reader.ReadAsync())
                            {
                                var row = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                                
                                for (int i = 0; i < reader.FieldCount; i++)
                                {
                                    string columnName = reader.GetName(i);
                                    object? value = reader.IsDBNull(i) ? null : reader.GetValue(i);

                                    if (value is DateTime dt)
                                    {
                                        value = dt.ToString("yyyy-MM-dd");
                                    }
                                    
                                    if (value is string strValue)
                                    {
                                        value = strValue.Trim();
                                    }

                                    row[columnName] = value ?? DBNull.Value;
                                }
                                
                                results.Add(row);
                            }
                        }
                    }

                    if (results.Count == 0)
                    {
                        _logger.LogWarning($"No data found in SQL View for batchNo: {batchNo}");
                        return NotFound($"No data found for batch: {batchNo}");
                    }

                    _logger.LogInformation($"Successfully retrieved {results.Count} records from SQL View for batchNo: {batchNo}");
                    
                    foreach (var row in results)
                    {
                        if (row.TryGetValue("ShipToCountry", out var shipToCountry) || 
                            row.TryGetValue("SHIPTO_COUNTRY", out shipToCountry))
                        {
                            _logger.LogInformation($"Record CustKey: {row["CustKey"] ?? "N/A"}, ItemKey: {row["ItemKey"] ?? "N/A"}, ShipToCountry: {shipToCountry ?? "null"}");
                        }
                    }

                    return Ok(results);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error fetching data from SQL View for batchNo: {batchNo}");
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }
    }
} 