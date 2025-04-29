using Dapper;
using Microsoft.Data.SqlClient;
using Models;

namespace Repositories;
public class LabelTemplateRepository
{
    private readonly string _connStr;
    public LabelTemplateRepository(string connStr) => _connStr = connStr;

    public async Task<IEnumerable<LabelTemplate>> GetAllActiveTemplates()
    {
        using var conn = new SqlConnection(_connStr);
        return await conn.QueryAsync<LabelTemplate>("SELECT * FROM FgL.LabelTemplate WHERE Active = 1");
    }
}