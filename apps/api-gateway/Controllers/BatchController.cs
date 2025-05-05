using System.Threading.Tasks;
using FgLabel.Shared.Models;
using FgLabel.Api.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace FgLabel.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class BatchController : ControllerBase
    {
        private readonly IBatchRepository _batchRepository;

        public BatchController(IBatchRepository batchRepository)
        {
            _batchRepository = batchRepository;
        }

        [HttpGet("{batchNo}")]
        public async Task<ActionResult<BatchInfo>> GetBatchInfo(string batchNo)
        {
            var batchInfo = await _batchRepository.GetBatchInfoAsync(batchNo);
            if (batchInfo == null)
            {
                return NotFound();
            }

            return Ok(batchInfo);
        }
    }
} 