using System;
using System.Collections.Generic;
using System.Data;
using System.Threading.Tasks;
using Dapper;
using FgLabel.Api.Models;
using Microsoft.Extensions.Logging;

namespace FgLabel.Api.Repositories
{
    public interface IBatchRepository
    {
        Task<BatchDto?> GetBatchByNumber(string batchNo);
        Task<IEnumerable<LabelRowDto>> GetBatchPrintData(string batchNo, string? bagNo = null);
    }

    public class BatchRepository : IBatchRepository
    {
        private readonly IDbConnection _db;
        private readonly ILogger<BatchRepository> _logger;

        public BatchRepository(IDbConnection db, ILogger<BatchRepository> logger)
        {
            _db = db;
            _logger = logger;
        }

        public async Task<BatchDto?> GetBatchByNumber(string batchNo)
        {
            try
            {
                var sql = @"SELECT TOP 1 * FROM FgL.vw_Label_PrintSummary WHERE BatchNo = @BatchNo";
                BatchDto? result = await _db.QueryFirstOrDefaultAsync<BatchDto>(sql, new { BatchNo = batchNo });
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving batch {BatchNo}", batchNo);
                return null;
            }
        }

        public async Task<IEnumerable<LabelRowDto>> GetBatchPrintData(string batchNo, string? bagNo = null)
        {
            try
            {
                if (string.IsNullOrEmpty(bagNo))
                {
                    // เรียกใช้ stored procedure
                    var parameters = new DynamicParameters();
                    parameters.Add("@BatchNo", batchNo);
                    
                    var result = await _db.QueryAsync<LabelRowDto>(
                        "FgL.usp_GetLabelDataByBatchNo", 
                        parameters,
                        commandType: CommandType.StoredProcedure,
                        commandTimeout: 30);
                    
                    return result;
                }
                else
                {
                    // ถ้ามีข้อมูล bagNo ให้ใส่พารามิเตอร์เพิ่ม
                    var parameters = new DynamicParameters();
                    parameters.Add("@BatchNo", batchNo);
                    parameters.Add("@BagNo", bagNo);
                    
                    var result = await _db.QueryAsync<LabelRowDto>(
                        "FgL.usp_GetLabelDataByBatchNo", 
                        parameters,
                        commandType: CommandType.StoredProcedure,
                        commandTimeout: 30);
                    
                    return result;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving batch print data for {BatchNo}", batchNo);
                return new List<LabelRowDto>();
            }
        }
    }
} 