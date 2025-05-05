using System.Collections.Generic;
using System.Threading.Tasks;
using FgLabel.Shared.Models;

namespace FgLabel.Api.Services
{
    public interface IBatchService
    {
        Task<BatchInfoDto> GetBatchInfo(int batchId);
        Task<IEnumerable<BatchDto>> GetCurrentBatchesAsync();
    }
}