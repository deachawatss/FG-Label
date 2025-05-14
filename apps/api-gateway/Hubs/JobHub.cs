using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using System;
using System.Threading.Tasks;

namespace Hubs;

[Authorize]
public class JobHub : Hub
{
    private readonly ILogger<JobHub> _logger;

    public JobHub(ILogger<JobHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var user = Context.User?.Identity?.Name ?? "ไม่รู้จัก";
        var connectionId = Context.ConnectionId;
        
        _logger.LogInformation("ผู้ใช้งาน {User} เชื่อมต่อกับ SignalR Hub: {ConnectionId}", user, connectionId);
        
        await Clients.Caller.SendAsync("connection:status", new { 
            status = "connected", 
            message = $"เชื่อมต่อสำเร็จ: {DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")}" 
        });
        
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var user = Context.User?.Identity?.Name ?? "ไม่รู้จัก";
        var connectionId = Context.ConnectionId;
        
        if (exception != null)
        {
            _logger.LogWarning("ผู้ใช้งาน {User} ขาดการเชื่อมต่อจาก SignalR Hub เนื่องจากข้อผิดพลาด: {Error}", 
                user, exception.Message);
        }
        else
        {
            _logger.LogInformation("ผู้ใช้งาน {User} ยกเลิกการเชื่อมต่อจาก SignalR Hub: {ConnectionId}", 
                user, connectionId);
        }
        
        await base.OnDisconnectedAsync(exception);
    }

    // ฟังก์ชันสำหรับทดสอบการเชื่อมต่อ
    public async Task Ping()
    {
        await Clients.Caller.SendAsync("pong", new { 
            timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") 
        });
    }

    // เพิ่มฟังก์ชันเพื่อดึงสถานะ Hub
    public async Task GetHubStatus()
    {
        await Clients.Caller.SendAsync("connection:status", new { 
            status = "connected", 
            connectionId = Context.ConnectionId,
            user = Context.User?.Identity?.Name ?? "ไม่รู้จัก",
            timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
        });
    }

    // สามารถเพิ่ม method สำหรับ push job status ได้
}