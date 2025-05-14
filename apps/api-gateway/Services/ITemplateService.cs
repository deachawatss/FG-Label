using System.Threading.Tasks;
using FgLabel.Api.Models;

namespace FgLabel.Api.Services
{
    public interface ITemplateService
    {
        Task<int> GetMappingForBatchAsync(string batchNo);
        Task<int> AutoCreateTemplateAsync(AutoCreateRequest request);
        Task<int> SaveTemplateAsync(CreateTemplateRequest request);
        Task<bool> DeleteTemplateAsync(int templateId);
    }
}