using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using QuestPDF.Elements;
using System.IO;
using System.Text;

namespace FgLabel.Api.Integration;

public class LabelPdfRenderer
{
    public byte[] RenderLabel(string html)
    {
        return Document.Create(container => 
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(20);
                    
                    page.Content().Column(column =>
                    {
                        column.Item().Text(html);
                    });
                });
            })
            .GeneratePdf();
    }

    void ComposeContent(IContainer container)
    {
        container.Text("Label PDF");
    }
} 