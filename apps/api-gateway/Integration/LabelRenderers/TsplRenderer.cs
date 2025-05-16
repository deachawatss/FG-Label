using System;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using System.Runtime.Versioning;

namespace FgLabel.Api.Integration.LabelRenderers
{
    /// <summary>
    /// Renderer สำหรับเครื่องพิมพ์ TSPL (TSC Programming Language)
    /// </summary>
    public class TsplRenderer : ILabelRenderer
    {
        private readonly ILogger<TsplRenderer> _logger;
        
        public TsplRenderer(ILogger<TsplRenderer> logger)
        {
            _logger = logger;
        }
        
        /// <summary>
        /// ประเภทของเครื่องมือที่รองรับ
        /// </summary>
        public string EngineType => "TSPL";
        
        /// <summary>
        /// ตรวจสอบว่า renderer นี้สามารถประมวลผลประเภทเทมเพลตนี้ได้หรือไม่
        /// </summary>
        public bool CanRender(string templateEngine)
        {
            if (string.IsNullOrEmpty(templateEngine))
                return false;
                
            return templateEngine.Trim().ToUpperInvariant() == "TSPL" || 
                   templateEngine.Trim().ToUpperInvariant() == "TSC";
        }
        
        /// <summary>
        /// ประมวลผลเทมเพลตด้วยข้อมูล
        /// </summary>
        public string ProcessTemplate(string template, object data)
        {
            try
            {
                _logger.LogDebug("Processing TSPL template with data");
                
                if (string.IsNullOrEmpty(template))
                {
                    _logger.LogWarning("TSPL template is empty");
                    return string.Empty;
                }
                
                // แปลง data เป็น JsonElement
                JsonElement? jsonData = null;
                if (data is JsonElement element)
                {
                    jsonData = element;
                }
                else
                {
                    string jsonString = JsonSerializer.Serialize(data);
                    jsonData = JsonSerializer.Deserialize<JsonElement>(jsonString);
                }
                
                if (jsonData == null)
                {
                    _logger.LogWarning("Failed to convert data to JsonElement");
                    return template;
                }
                
                string result = template;
                
                // หา placeholder ในรูปแบบ ${field.name} หรือ #{field.name}
                var placeholderPattern = @"[\$#]\{([^}]+)\}";
                var matches = Regex.Matches(template, placeholderPattern);
                
                foreach (Match match in matches)
                {
                    string placeholder = match.Value;
                    string fieldPath = match.Groups[1].Value.Trim();
                    
                    // แยก path ออกเป็นส่วนๆ (เช่น customer.address.city)
                    string[] pathParts = fieldPath.Split('.', StringSplitOptions.RemoveEmptyEntries);
                    
                    // ค้นหาค่าตามพาธที่กำหนด
                    JsonElement currentElement = jsonData.Value;
                    bool found = true;
                    
                    foreach (var part in pathParts)
                    {
                        if (currentElement.ValueKind == JsonValueKind.Object && 
                            currentElement.TryGetProperty(part, out JsonElement childElement))
                        {
                            currentElement = childElement;
                        }
                        else
                        {
                            found = false;
                            break;
                        }
                    }
                    
                    if (found)
                    {
                        string value = currentElement.ToString() ?? string.Empty;
                        result = result.Replace(placeholder, value);
                    }
                }
                
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing TSPL template");
                return template; // ส่งคืนเทมเพลตเดิมถ้าเกิดข้อผิดพลาด
            }
        }
        
        /// <summary>
        /// แปลงเทมเพลตที่ประมวลผลแล้วเป็นไบต์อาร์เรย์
        /// </summary>
        public byte[] RenderLabel(string processedContent)
        {
            try
            {
                _logger.LogDebug("Rendering TSPL label");
                
                if (string.IsNullOrEmpty(processedContent))
                {
                    _logger.LogWarning("Processed TSPL content is empty");
                    return Array.Empty<byte>();
                }
                
                // TSPL เป็นภาษาพิมพ์ที่ใช้ข้อความล้วน ดังนั้นเพียงแค่แปลงเป็นไบต์
                return Encoding.ASCII.GetBytes(processedContent);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error rendering TSPL label");
                return Array.Empty<byte>();
            }
        }
        
        /// <summary>
        /// ส่งข้อมูลไปยังเครื่องพิมพ์ทางเน็ตเวิร์ค
        /// </summary>
        public async Task SendToPrinterAsync(string printerAddress, byte[] labelData)
        {
            try
            {
                _logger.LogInformation("Sending TSPL data to printer at {Address}", printerAddress);
                
                // ใช้ TCP สำหรับการส่งข้อมูลไปยังเครื่องพิมพ์ TSPL
                using var client = new TcpClient();
                
                // กำหนด timeout สำหรับการเชื่อมต่อ
                var connectTask = client.ConnectAsync(printerAddress, 9100); // พอร์ต 9100 เป็นพอร์ตมาตรฐานสำหรับเครื่องพิมพ์ TSPL
                
                await Task.WhenAny(connectTask, Task.Delay(5000)); // 5 วินาที timeout
                
                if (!connectTask.IsCompleted)
                {
                    throw new TimeoutException($"Connection to printer {printerAddress} timed out");
                }
                
                await connectTask; // จะ throw exception ถ้ามีปัญหา
                
                // ส่งข้อมูลไปยังเครื่องพิมพ์
                using var stream = client.GetStream();
                await stream.WriteAsync(labelData, 0, labelData.Length);
                await stream.FlushAsync();
                
                _logger.LogInformation("Successfully sent TSPL data to printer at {Address}", printerAddress);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending data to TSPL printer at {Address}", printerAddress);
                throw; // ส่งต่อข้อผิดพลาดให้ผู้เรียกใช้จัดการ
            }
        }
        
        /// <summary>
        /// ส่งข้อมูลไปยังเครื่องพิมพ์บนเครื่องโดยตรง (สำหรับการพัฒนา/ทดสอบ)
        /// </summary>
        [SupportedOSPlatform("windows")]
        public void PrintToLocalPrinter(string printerName, byte[] labelData)
        {
            try
            {
                _logger.LogInformation("Printing TSPL data to local printer: {PrinterName}", printerName);
                
                var printerSettings = new PrinterSettings
                {
                    PrinterName = printerName,
                    Copies = 1
                };
                
                using var printDoc = new PrintDocument();
                printDoc.PrinterSettings = printerSettings;
                
                printDoc.PrintPage += (sender, e) =>
                {
                    // แปลงไบต์อาร์เรย์กลับเป็นข้อความ TSPL (สำหรับการพิมพ์)
                    string tsplCommand = Encoding.ASCII.GetString(labelData);
                    
                    // แสดงข้อความบนหน้ากระดาษ (เฉพาะเพื่อการทดสอบ - ไม่ใช่การแปลง TSPL จริง)
                    if (e.Graphics != null)
                    {
                        using var font = new Font("Consolas", 10);
                        e.Graphics.DrawString(tsplCommand, font, Brushes.Black, e.PageBounds);
                    }
                };
                
                printDoc.Print();
                
                _logger.LogInformation("Successfully sent TSPL data to local printer: {PrinterName}", printerName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error printing to local printer: {PrinterName}", printerName);
                throw;
            }
        }
    }
} 