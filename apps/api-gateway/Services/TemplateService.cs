using System;
using System.Data;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using FgLabel.Api.Models;

namespace FgLabel.Api.Services
{
    public class TemplateService : ITemplateService
    {
        private readonly string _connectionString;
        private readonly ILogger<TemplateService> _logger;

        public TemplateService(IConfiguration configuration, ILogger<TemplateService> logger)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("SQL connection string missing");
            _logger = logger;
        }

        public async Task<int> CreateOrGetTemplateAsync(string batchNo)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            // Get batch info
            var batch = await connection.QueryFirstOrDefaultAsync<BatchDto>(
                "SELECT * FROM FgL.vw_Label_BatchInfo WHERE BatchNo = @BatchNo",
                new { BatchNo = batchNo });

            if (batch == null)
            {
                _logger.LogWarning("Batch {BatchNo} not found, creating default template", batchNo);
                // Create default template if batch not found
                var defaultTemplateId = await connection.ExecuteScalarAsync<int>(
                    @"INSERT INTO FgL.LabelTemplate (
                        ProductKey, CustomerKey, Active, CreatedAt
                      ) VALUES (
                        NULL, NULL, 1, GETUTCDATETIME()
                      );
                      SELECT SCOPE_IDENTITY();");

                _logger.LogInformation("Created default template {TemplateId} for batch {BatchNo}",
                    defaultTemplateId, batchNo);
                return defaultTemplateId;
            }

            // Check existing template
            var existingTemplateId = await connection.QueryFirstOrDefaultAsync<int?>(
                @"SELECT TOP 1 TemplateID 
                  FROM FgL.LabelTemplateMapping 
                  WHERE Active = 1 
                    AND (@prod IS NULL OR ProductKey = @prod)
                    AND (@cust IS NULL OR CustomerKey = @cust)
                  ORDER BY
                    CASE WHEN ProductKey IS NOT NULL AND CustomerKey IS NOT NULL THEN 1
                         WHEN CustomerKey IS NOT NULL THEN 2
                         WHEN ProductKey IS NOT NULL THEN 3
                         ELSE 4 END,
                    Priority;",
                new { prod = batch.ProductKey, cust = batch.CustomerKey });

            if (existingTemplateId.HasValue)
            {
                _logger.LogInformation("Found existing template {TemplateId} for batch {BatchNo}",
                    existingTemplateId.Value, batchNo);
                return existingTemplateId.Value;
            }

            // Create new template
            var newTemplateId = await connection.ExecuteScalarAsync<int>(
                @"INSERT INTO FgL.LabelTemplate (
                    ProductKey, CustomerKey, Active, CreatedAt
                  ) VALUES (
                    @ProductKey, @CustomerKey, 1, GETUTCDATETIME()
                  );
                  SELECT SCOPE_IDENTITY();",
                new { batch.ProductKey, batch.CustomerKey });

            _logger.LogInformation("Created new template {TemplateId} for batch {BatchNo}",
                newTemplateId, batchNo);
            return newTemplateId;
        }

        public async Task<int> AutoCreateTemplateAsync(AutoCreateRequest request)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            // Create new template
            var templateId = await connection.ExecuteScalarAsync<int>(
                @"INSERT INTO FgL.LabelTemplate (
                    ProductKey, CustomerKey, Active, CreatedAt
                  ) VALUES (
                    @ProductKey, @CustomerKey, 1, GETUTCDATETIME()
                  );
                  SELECT SCOPE_IDENTITY();",
                new { request.ProductKey, request.CustomerKey });

            _logger.LogInformation("Created new template {TemplateId} for product {ProductKey} and customer {CustomerKey}",
                templateId, request.ProductKey, request.CustomerKey);
            return templateId;
        }
    }
}