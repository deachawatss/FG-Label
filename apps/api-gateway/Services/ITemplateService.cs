using System.Threading.Tasks;
using FgLabel.Shared.Models;

namespace FgLabel.Api.Services
{
    public interface ITemplateService
    {
        Task<int> CreateOrGetTemplateAsync(string batchNo);
        Task<int> AutoCreateTemplateAsync(AutoCreateRequest request);
        Task<int> SaveTemplateAsync(CreateTemplateRequest request);
    }
}