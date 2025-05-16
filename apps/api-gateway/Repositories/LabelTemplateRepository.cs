using System.Data;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;
using Dapper;
using FgLabel.Api.Models;
using Microsoft.Extensions.Logging;

namespace FgLabel.Api.Repositories;

public interface ILabelTemplateRepository
{
    Task<IEnumerable<LabelTemplateClass>> GetAllActiveTemplates();
    Task<LabelTemplateClass?> GetTemplateById(int id);
}

public class LabelTemplateRepository : ILabelTemplateRepository
{
    private readonly IDbConnection _db;
    private readonly ILogger<LabelTemplateRepository> _logger;

    public LabelTemplateRepository(IDbConnection db, ILogger<LabelTemplateRepository> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<IEnumerable<LabelTemplateClass>> GetAllActiveTemplates()
    {
        _logger.LogInformation("Retrieving all active templates");
        return await _db.QueryAsync<LabelTemplateClass>(
            "SELECT * FROM FgL.LabelTemplate WHERE Active = 1 ORDER BY TemplateID ASC");
    }

    public async Task<LabelTemplateClass?> GetTemplateById(int id)
    {
        return await _db.QuerySingleOrDefaultAsync<LabelTemplateClass>(
            "SELECT * FROM FgL.LabelTemplate WHERE TemplateID = @Id", 
            new { Id = id });
    }
}