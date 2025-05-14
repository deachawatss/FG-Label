using System.Threading.Tasks;
using FgLabel.Api.Repositories;
using Microsoft.AspNetCore.Mvc;
using FgLabel.Api.Models;

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
        public async Task<ActionResult<LabelRowDto>> GetBatchInfo(string batchNo, [FromQuery] string? bagNo = null)
        {
            var batchInfo = await _batchRepository.GetBatchPrintData(batchNo, bagNo);
            if (batchInfo == null)
            {
                return NotFound();
            }

            return Ok(batchInfo);
        }
    }
} 