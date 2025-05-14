using System.Collections.Generic;
using System.Threading.Tasks;
using FgLabel.Api.Models;

namespace FgLabel.Api.Services
{
    public interface IBatchService
    {
        Task<BatchInfoDto> GetBatchInfo(int batchId);
        Task<IEnumerable<BatchDto>> GetCurrentBatchesAsync();
        Task<IEnumerable<LabelRowDto>> GetBatchData(string batchNo, string? bagNo = null);
    }
}