namespace FgLabel.Api.Models;

public record UpdateLabelRequest(
    DateTime ProductionDate,
    int BagStart,
    int BagEnd,
    bool QcSample,
    bool FormulaSheet,
    bool PalletTag
); 