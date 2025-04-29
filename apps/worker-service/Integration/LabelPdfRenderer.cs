using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using QuestPDF.Elements;
using iText.Kernel.Pdf;
using iText.Html2pdf;
using System.IO;

namespace Integration;

public class LabelPdfRenderer
{
    public byte[] RenderLabel(string html)
    {
        using var memoryStream = new MemoryStream();
        using var writer = new PdfWriter(memoryStream);
        using var pdf = new PdfDocument(writer);
        
        HtmlConverter.ConvertToPdf(html, memoryStream);
        pdf.Close();
        
        return memoryStream.ToArray();
    }

    void ComposeContent(IContainer container)
    {
        container.Text("Label PDF");
    }
} 