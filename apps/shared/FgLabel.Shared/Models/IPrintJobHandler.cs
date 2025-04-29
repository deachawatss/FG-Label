using FgLabel.Shared.Models;

namespace FgLabel.Shared.Models;

public interface IPrintJobHandler
{
    Task HandleAsync(PrintJob job);
} 