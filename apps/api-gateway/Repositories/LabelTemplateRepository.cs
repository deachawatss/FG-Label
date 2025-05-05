using Dapper;
using Microsoft.Data.SqlClient;
using FgLabel.Shared.Models;
using Microsoft.Extensions.Logging;

namespace FgLabel.Api.Repositories;

public interface ILabelTemplateRepository
{
    Task<IEnumerable<LabelTemplate>> GetAllActiveTemplates();
}

public class LabelTemplateRepository : ILabelTemplateRepository
{
    private readonly string _connStr;
    private readonly ILogger<LabelTemplateRepository> _logger;

    public LabelTemplateRepository(string connStr, ILogger<LabelTemplateRepository> logger) 
    {
        _connStr = connStr;
        _logger = logger;
    }

    public async Task<IEnumerable<LabelTemplate>> GetAllActiveTemplates()
    {
        using var conn = new SqlConnection(_connStr);
        _logger.LogInformation("Retrieving all active templates");
        return await conn.QueryAsync<LabelTemplate>("SELECT * FROM FgL.LabelTemplate WHERE Active = 1");
    }
}