using System.Threading.Tasks;
using FgLabel.Api.Models;

namespace FgLabel.Api.Services
{
    public interface ITemplateService
    {
        Task<int> CreateOrGetTemplateAsync(string batchNo);
        Task<int> AutoCreateTemplateAsync(AutoCreateRequest request);
    }
}