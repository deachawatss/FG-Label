#nullable enable
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Dapper;
using DotNetEnv;
using HealthChecks.Redis;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using RabbitMQ.Client;
using StackExchange.Redis;
using FgLabel.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Caching.StackExchangeRedis;
using Microsoft.Extensions.Caching.Distributed;
using System.Data;
using FgLabel.Api.Models;
using FgLabel.Api.Utilities;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Hosting;
using FgLabel.Api.Repositories;
using Microsoft.Extensions.Hosting;
using FgLabel.Api.Integration.LabelRenderers;

namespace FgLabel.Api;

// Define LabelTemplate class for template records
public record LabelTemplate
{
    public int TemplateID { get; set; }
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? Engine { get; set; }
    public string? PaperSize { get; set; }
    public string? Orientation { get; set; }
    public string? Content { get; set; }
    public string? ProductKey { get; set; }
    public string? CustomerKey { get; set; }
    public decimal Version { get; set; } = 1;
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<LabelTemplateComponent> Components { get; set; } = new List<LabelTemplateComponent>();
    
    // สำหรับรองรับการใช้งาน with pattern
    public LabelTemplate With(List<LabelTemplateComponent> components)
    {
        return this with { Components = components };
    }
}

// Define LabelTemplateComponent class for template components
public class LabelTemplateComponent
{
    public int ComponentID { get; set; }
    public int TemplateID { get; set; }
    public string? ComponentType { get; set; }
    public int X { get; set; }
    public int Y { get; set; }
    public int W { get; set; }
    public int H { get; set; }
    public string? FontName { get; set; }
    public int? FontSize { get; set; }
    public string? StaticText { get; set; }
    public string? Placeholder { get; set; }
    public string? BarcodeFormat { get; set; }
    public DateTime CreatedAt { get; set; }
}

// Define TemplateRequest class for template update operations
public class TemplateRequest
{
    public int? TemplateID { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ProductKey { get; set; }
    public string? CustomerKey { get; set; }
    public string? Engine { get; set; }
    public string? PaperSize { get; set; }
    public string? Orientation { get; set; }
    public string? Content { get; set; }
    public bool IncrementVersion { get; set; }
    public List<TemplateComponent>? Components { get; set; }
}

public class TemplateComponent
{
    public string Type { get; set; } = string.Empty;
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public object? Content { get; set; }
}

// เพิ่มคลาส LabelTemplateDto สำหรับการอ่านข้อมูลจากฐานข้อมูล
public class LabelTemplateDto
{
    public int TemplateID { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Engine { get; set; }
    public string? PaperSize { get; set; }
    public string? Orientation { get; set; }
    public string? Content { get; set; }
    public string? ProductKey { get; set; }
    public string? CustomerKey { get; set; }
    public decimal Version { get; set; } = 1;
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

// เพิ่ม class LabelRendererFactory สำหรับการ render ฉลาก
public class LabelRendererFactory
{
    private readonly ILogger<LabelRendererFactory> _logger;
    private readonly IConfiguration _configuration;
    
    public LabelRendererFactory(ILogger<LabelRendererFactory> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
    }
    
    public ILabelRenderer CreateRenderer(string engine)
    {
        _logger.LogInformation("Creating renderer for engine: {Engine}", engine);
        
        // สร้าง renderer ตามประเภทของ engine ที่กำหนด
        switch (engine?.ToLower())
        {
            case "html":
                return new HtmlLabelRenderer(_logger);
            case "canvas":
                return new CanvasLabelRenderer(_logger);
            default:
                _logger.LogWarning("Unknown engine type: {Engine}, falling back to HTML renderer", engine);
                return new HtmlLabelRenderer(_logger);
        }
    }
}

// เพิ่ม interface สำหรับ renderer
public interface ILabelRenderer
{
    Task<byte[]> RenderLabelAsync(string template, object data);
    string GetContentType();
}

// เพิ่ม implementation สำหรับ HTML renderer
public class HtmlLabelRenderer : ILabelRenderer
{
    private readonly ILogger _logger;
    
    public HtmlLabelRenderer(ILogger logger)
    {
        _logger = logger;
    }
    
    public async Task<byte[]> RenderLabelAsync(string template, object data)
    {
        _logger.LogInformation("Rendering HTML label");
        // ในที่นี้จะ return เป็น byte array ว่างๆ เพื่อให้โค้ดทำงานได้
        // ในการใช้งานจริงจะต้องมีการ implement การแปลง HTML เป็น PDF หรือรูปแบบอื่นๆ
        return await Task.FromResult(Array.Empty<byte>());
    }
    
    public string GetContentType() => "application/pdf";
}

// เพิ่ม implementation สำหรับ Canvas renderer
public class CanvasLabelRenderer : ILabelRenderer
{
    private readonly ILogger _logger;
    
    public CanvasLabelRenderer(ILogger logger)
    {
        _logger = logger;
    }
    
    public async Task<byte[]> RenderLabelAsync(string template, object data)
    {
        _logger.LogInformation("Rendering Canvas label");
        // เช่นเดียวกัน จะ return เป็น byte array ว่างๆ
        return await Task.FromResult(Array.Empty<byte>());
    }
    
    public string GetContentType() => "application/pdf";
}

public class Program
{
    // JWT configuration loaded once
    private static string _jwtKey = "";
    private static string _jwtIssuer = "FgLabel";
    private static string _jwtAudience = "FgLabel";
    
    // ฟังก์ชันสำหรับอัพเดต template mapping
    private static async Task UpdateTemplateMapping(IDbConnection connection, string? productKey, string? customerKey, int templateId)
    {
        // ถ้าไม่มี ProductKey และ CustomerKey ไม่ต้องทำ mapping
        if (string.IsNullOrEmpty(productKey) && string.IsNullOrEmpty(customerKey))
            return;
            
        // ตรวจสอบว่ามี mapping นี้อยู่แล้วหรือไม่
        var existingMapping = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
            SELECT MappingID 
            FROM FgL.LabelTemplateMapping 
            WHERE (ProductKey = @ProductKey OR (ProductKey IS NULL AND @ProductKey IS NULL))
              AND (CustomerKey = @CustomerKey OR (CustomerKey IS NULL AND @CustomerKey IS NULL))
              AND TemplateID = @TemplateID",
            new { ProductKey = productKey, CustomerKey = customerKey, TemplateID = templateId });
            
        if (existingMapping != null)
        {
            // อัปเดต mapping ที่มีอยู่แล้ว
            await connection.ExecuteAsync(@"
                UPDATE FgL.LabelTemplateMapping 
                SET IsActive = 1, 
                    UpdatedAt = GETDATE() 
                WHERE MappingID = @MappingID",
                new { MappingID = existingMapping.MappingID });
        }
        else
        {
            // สร้าง mapping ใหม่
            await connection.ExecuteAsync(@"
                INSERT INTO FgL.LabelTemplateMapping 
                    (TemplateID, ProductKey, CustomerKey, Priority, IsActive, CreatedAt) 
                VALUES 
                    (@TemplateID, @ProductKey, @CustomerKey, 
                    CASE WHEN @ProductKey IS NOT NULL AND @CustomerKey IS NOT NULL THEN 1
                         WHEN @ProductKey IS NOT NULL THEN 2
                         WHEN @CustomerKey IS NOT NULL THEN 3
                         ELSE 4 END, 
                    1, GETDATE())",
                new { TemplateID = templateId, ProductKey = productKey, CustomerKey = customerKey });
        }
    }
    
    /* ---------- JWT Helper ------------------------------------------------ */
    private static string GenerateJwtToken(string username)
    {
        var keyBytes = Encoding.UTF8.GetBytes(_jwtKey);

        var handler = new JwtSecurityTokenHandler();
        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, username) }),
            Expires = DateTime.UtcNow.AddDays(7),
            Issuer = _jwtIssuer,
            Audience = _jwtAudience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(keyBytes),
                SecurityAlgorithms.HmacSha256Signature)
        };
        return handler.WriteToken(handler.CreateToken(descriptor));
    }

    /* ---------------------------------------------------------------------- */

    // ---------- Config Helper --------------------------------------------- //
    private static string GetRequiredConfig(IConfiguration config, string key, string? fallback = null)
    {
        var value = config[key];
        if (!string.IsNullOrEmpty(value)) return value;
        if (fallback != null) return fallback;
        throw new InvalidOperationException($"Config key '{key}' is missing");
    }
    private static string? GetOptionalConfig(IConfiguration config, string key, string? fallback = null)
    {
        var value = config[key];
        return !string.IsNullOrEmpty(value) ? value : fallback;
    }

    // ---------- HealthCheck ResponseWriter (no async warning) ------------- //
    private static Task WriteHealthCheckResponse(HttpContext ctx, HealthReport rpt)
    {
        ctx.Response.ContentType = "application/json";
        
        var response = new
        {
            status = rpt.Status.ToString(),
            checks = rpt.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
                description = e.Value.Description,
                data = e.Value.Data
            }),
            duration = rpt.TotalDuration
        };

        return ctx.Response.WriteAsJsonAsync(response);
    }

    public static void Main(string[] args)
    {
        // call the async method in a blocking way - we're in the Main method
        MainAsync(args).GetAwaiter().GetResult();
    }

    public static async Task MainAsync(string[] args)
    {
        /* ------------------------------------------------------------------ */
        /* 1) โหลด .env  +  Environment variables                             */
        /* ------------------------------------------------------------------ */
        Env.Load("../../.env");
        var builder = WebApplication.CreateBuilder(args);
        builder.Configuration.AddEnvironmentVariables();
        builder.WebHost.UseUrls("http://+:5051");

        // Load JWT config values once (use section key)
        var jwtSection = builder.Configuration.GetSection("JWT");
        _jwtKey = Environment.GetEnvironmentVariable("JWT__Key") ?? jwtSection["Key"] ?? throw new InvalidOperationException("JWT Key is missing");

        // Validate JWT key length
        if (_jwtKey.Length * 8 < 256) // At least 256 bits (32 bytes)
        {
            throw new InvalidOperationException("JWT Key must be at least 32 bytes long");
        }

        _jwtIssuer = Environment.GetEnvironmentVariable("JWT__Issuer") ?? jwtSection["Issuer"] ?? throw new InvalidOperationException("JWT Issuer is missing");
        _jwtAudience = Environment.GetEnvironmentVariable("JWT__Audience") ?? jwtSection["Audience"] ?? _jwtIssuer;

        Console.WriteLine($"[JWT] KeyLength={_jwtKey.Length}, Issuer={_jwtIssuer}");

        // เพื่อให้เป็น async อย่างแท้จริง
        await Task.Yield();

        /* ------------------------------------------------------------------ */
        /* 2) Service & Infrastructure                                        */
        /* ------------------------------------------------------------------ */

        // ----- Swagger ----------------------------------------------------- //
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen(c =>
        {
            c.SwaggerDoc("v1", new OpenApiInfo { Title = "FG Label API", Version = "v1" });
            c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            {
                Description = "JWT Authorization header using the Bearer scheme",
                Name = "Authorization",
                In = ParameterLocation.Header,
                Type = SecuritySchemeType.ApiKey,
                Scheme = "Bearer"
            });
            c.AddSecurityRequirement(new OpenApiSecurityRequirement
            {
                {
                    new OpenApiSecurityScheme
                    {
                        Reference = new OpenApiReference
                        {
                            Type = ReferenceType.SecurityScheme,
                            Id = "Bearer"
                        }
                    },
                    Array.Empty<string>()
                }
            });
        });

        // ----- CORS  (ระบุ origin ของ front-end) --------------------------- //
        var frontendUrl = Environment.GetEnvironmentVariable("FRONTEND_URL") ?? 
            GetOptionalConfig(builder.Configuration, "Frontend:Url", "http://localhost:3500") ?? 
            "http://localhost:3500";

        Console.WriteLine($"[FgLabel] Frontend URL: {frontendUrl}");

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("AllowFrontend", builder =>
            {
                builder.WithOrigins(frontendUrl.Split(','))  // รองรับหลาย URL คั่นด้วยคอมม่า
                       .AllowAnyMethod()
                       .AllowAnyHeader()
                       .AllowCredentials()
                       .SetIsOriginAllowed(origin => true);
            });
        });

        // ----- SignalR + Redis back-plane ---------------------------------- //
        var redisConn = Environment.GetEnvironmentVariable("Redis__ConnectionString") 
            ?? GetOptionalConfig(builder.Configuration, "Redis__ConnectionString", "localhost:6379") 
            ?? "localhost:6379";
        try
        {
            builder.Services.AddSignalR(options =>
            {
                options.EnableDetailedErrors = true;
                options.MaximumReceiveMessageSize = 102400; // 100 KB
            });
            builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
                ConnectionMultiplexer.Connect(redisConn));
            builder.Services.AddStackExchangeRedisCache(o =>
            {
                o.Configuration = redisConn;
                o.InstanceName = "FgLabel_";
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine("[FgLabel] Redis/SignalR connection failed: " + ex.Message);
        }

        // ----- JWT --------------------------------------------------------- //
        try
        {
            // Validate JWT config
            if (string.IsNullOrWhiteSpace(_jwtKey))
            {
                throw new InvalidOperationException("JWT Key is missing – set JWT__Key in .env");
            }

            if (string.IsNullOrWhiteSpace(_jwtIssuer))
            {
                throw new InvalidOperationException("JWT Issuer is missing – set JWT__Issuer in .env");
            }

            if (string.IsNullOrWhiteSpace(_jwtAudience))
            {
                throw new InvalidOperationException("JWT Audience is missing – set JWT__Audience in .env");
            }

            builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(opt => JwtHelper.ConfigureJwt(opt, _jwtKey, _jwtIssuer, _jwtAudience));
            builder.Services.AddAuthorization();

            Console.WriteLine($"[JWT] KeyLength={_jwtKey.Length}, Issuer={_jwtIssuer}, Audience={_jwtAudience}");
        }
        catch (Exception ex)
        {
            Console.WriteLine("[FgLabel] JWT setup failed: " + ex.Message);
            throw; // Rethrow to prevent app from starting with broken JWT
        }

        // ----- SQL Connection String  ------------------------------------- //
        string sqlConn = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection") 
            ?? builder.Configuration.GetConnectionString("DefaultConnection") 
            ?? "";

        // Register IDbConnection
        builder.Services.AddScoped<IDbConnection>(_ => new SqlConnection(sqlConn));
        builder.Services.AddSingleton<ISqlConnectionFactory>(new SqlConnectionFactory(sqlConn));

        // ----- RabbitMQ Connection Factory --------------------------------- //
        var rabbitHost = Environment.GetEnvironmentVariable("RABBITMQ__HostName") ?? "localhost";
        var rabbitUser = Environment.GetEnvironmentVariable("RABBITMQ__UserName") ?? "guest";
        var rabbitPass = Environment.GetEnvironmentVariable("RABBITMQ__Password") ?? "guest";

        var rabbitFactory = new ConnectionFactory
        {
            HostName = rabbitHost,
            UserName = rabbitUser,
            Password = rabbitPass
        };

        builder.Services.AddSingleton<IConnectionFactory>(rabbitFactory);

        // ----- Health-checks ---------------------------------------------- //
        try
        {
            builder.Services.AddHealthChecks()
                .AddRedis(redisConn, "redis")
                .AddSqlServer(sqlConn ?? "")
                .AddRabbitMQ($"amqp://{rabbitUser}:{rabbitPass}@{rabbitHost}", null, "rabbitmq");
        }
        catch (Exception ex)
        {
            Console.WriteLine("[FgLabel] HealthChecks setup failed: " + ex.Message);
        }

        builder.Services.AddScoped<IBatchService, BatchService>();
        builder.Services.AddScoped<ITemplateService, TemplateService>();
        builder.Services.AddScoped<IBatchRepository, BatchRepository>();
        builder.Services.AddScoped<ILabelRepository, LabelRepository>();
        builder.Services.AddScoped<ILabelTemplateRepository>(sp => 
            new LabelTemplateRepository(
                new SqlConnection(sp.GetRequiredService<IConfiguration>().GetConnectionString("DefaultConnection")!),
                sp.GetRequiredService<ILogger<LabelTemplateRepository>>()
            ));

        // Load LDAP configuration from environment variables
        var ldapServer = Environment.GetEnvironmentVariable("AD__Url") ?? "ldap://default";
        var ldapBaseDn = Environment.GetEnvironmentVariable("AD__BaseDn") ?? "DC=example,DC=com";
        var ldapUser = Environment.GetEnvironmentVariable("AD__Username") ?? "defaultUser";
        var ldapPassword = Environment.GetEnvironmentVariable("AD__Password") ?? "defaultPassword";
        var isLdapBypassed = Environment.GetEnvironmentVariable("BYPASS_LDAP")?.ToLower() == "true";

        Console.WriteLine($"[LDAP] Server={ldapServer}, BaseDn={ldapBaseDn}, User={ldapUser}");

        // ลงทะเบียน LDAP service
        builder.Services.Configure<LdapConfig>(options => {
            options.Url = ldapServer;
            options.BaseDn = ldapBaseDn;
            options.Username = ldapUser;
            options.Password = ldapPassword;
        });
        builder.Services.AddSingleton<ILdapService, LdapService>();

        // ลงทะเบียนบริการสำหรับการพิมพ์
        builder.Services.AddScoped<IPrintService, PrintService>();
        builder.Services.AddSingleton<FgLabel.Api.Integration.LabelRenderers.ZplRenderer>();
        builder.Services.AddSingleton<FgLabel.Api.Integration.LabelRenderers.TsplRenderer>();
        
        // ลงทะเบียน ILabelRenderer ทั้งหมด
        builder.Services.AddSingleton<IEnumerable<FgLabel.Api.Integration.LabelRenderers.ILabelRenderer>>(sp => 
        {
            return new List<FgLabel.Api.Integration.LabelRenderers.ILabelRenderer>
            {
                sp.GetRequiredService<FgLabel.Api.Integration.LabelRenderers.ZplRenderer>(),
                sp.GetRequiredService<FgLabel.Api.Integration.LabelRenderers.TsplRenderer>()
            };
        });
        
        // ลงทะเบียน LabelRendererFactory
        builder.Services.AddSingleton<FgLabel.Api.Integration.LabelRenderers.LabelRendererFactory>();

        /* ------------------------------------------------------------------ */
        Console.WriteLine("[FgLabel] Before builder.Build()");
        var app = builder.Build();
        Console.WriteLine("[FgLabel] After builder.Build()");

        // Test LDAP connection after app is built
        if (!isLdapBypassed)
        {
            using var scope = app.Services.CreateScope();
            var ldapServiceScope = scope.ServiceProvider.GetService<ILdapService>();
            var loggerScope = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
            var ldapOptions = scope.ServiceProvider.GetService<IOptions<LdapConfig>>()?.Value;

            try
            {
                if (ldapServiceScope == null)
                {
                    loggerScope.LogWarning("[FgLabel] LDAP service not available");
                    if (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development")
                    {
                        loggerScope.LogWarning("[FgLabel] ⚠️ Warning: Continuing in development mode without LDAP.");
                    }
                    else
                    {
                        throw new InvalidOperationException("LDAP service not registered properly");
                    }
                }
                else if (!ldapServiceScope.TestConnection())
                {
                    var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
                    if (env == "Development" || env == "dev")
                    {
                        loggerScope.LogWarning("[FgLabel] ⚠️ Warning: LDAP connection failed but continuing in development mode.");
                        if (ldapOptions != null)
                        {
                            loggerScope.LogWarning("[FgLabel] LDAP URL: {Url}", ldapOptions.Url);
                            loggerScope.LogWarning("[FgLabel] LDAP BaseDN: {BaseDn}", ldapOptions.BaseDn);
                        }
                        else
                        {
                            loggerScope.LogWarning("[FgLabel] LDAP configuration is not available");
                        }
                    }
                    else
                    {
                        throw new InvalidOperationException("Cannot connect to LDAP server");
                    }
                }
                else
                {
                    loggerScope.LogInformation("[FgLabel] LDAP connection test successful");
                }
            }
            catch (Exception ex)
            {
                var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
                if (env == "Development" || env == "dev")
                {
                    Console.WriteLine($"[FgLabel] ⚠️ Warning: LDAP connection error: {ex.Message}");
                    Console.WriteLine("[FgLabel] Continuing in development mode");
                }
                else
                {
                    throw new InvalidOperationException($"LDAP connection error: {ex.Message}");
                }
            }
        }

        var log = app.Services.GetRequiredService<ILoggerFactory>()
                             .CreateLogger("FgLabel.Api");

        app.UseSwagger();
        app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "FG Label API v1"));
        app.UseRouting();
        app.UseCors("AllowFrontend");
        app.UseAuthentication();
        app.UseAuthorization();

        // ---------- /healthz ---------------------------------------------- //
        app.MapHealthChecks("/healthz", new HealthCheckOptions
        {
            ResponseWriter = WriteHealthCheckResponse
        });

        // ---------- /healthz-simple --------------------------------------- //
        app.MapGet("/healthz-simple", () => Results.Ok("OK"));

        // ------------------------------------------------------------------ //
        // 4) Endpoints                                                       //
        // ------------------------------------------------------------------ //

        /* ---------- 4.1  POST /api/auth/login --------------------------------- */
        app.MapPost("/api/auth/login", async (FgLabel.Api.Models.LoginRequest login, ILogger<Program> log) =>
        {
            // Mask password in logs
            log.LogInformation("/api/auth/login username: {Username}", login.username);

            try 
            {
                var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
                if (env == "Development" || env == "dev")
                {
                    // Development mode or LDAP bypass mode
                    var bypassToken = GenerateJwtToken(login.username);
                    log.LogInformation("Login successful in development mode for user: {Username}", login.username);
                    return Results.Ok(new { token = bypassToken, user = new { username = login.username } });
                }

                // ในโหมดการทำงานจริง ให้ใช้ LDAP
                var ldapService = app.Services.GetService<ILdapService>();
                if (ldapService == null)
                {
                    log.LogError("LDAP service not available");
                    return Results.Problem("LDAP service not available");
                }

                // LDAP validation can be slow, run it in a background thread to avoid blocking
                var isValid = await Task.Run(() => ldapService.ValidateUser(login.username, login.password));
                if (!isValid)
                {
                    log.LogWarning("Login failed for user: {Username}", login.username);
                    return Results.Unauthorized();
                }

                var authToken = GenerateJwtToken(login.username);
                return Results.Ok(new { token = authToken, user = new { username = login.username } });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error during login for user: {Username}", login.username);
                return Results.Problem("Internal server error during login");
            }
        });

        /* ---------- 4.2  GET /api/batches/current ------------------------- */
        app.MapGet("/api/batches/current", async ([FromServices] IBatchService batchService) =>
        {
            var batches = await batchService.GetCurrentBatchesAsync();
            return Results.Ok(batches);
        }).RequireAuthorization();

        /* ---------- 4.2.1  GET /api/batch/{batchNo} ----------------------- */
        app.MapGet("/api/batch/{batchNo}", async (string batchNo, [FromServices] IDbConnection db, ILogger<Program> logger) =>
        {
            try
            {
                logger.LogInformation("Getting batch info for BatchNo: {BatchNo}", batchNo);
                
                // Query batch information directly from the database
                var sql = "SELECT * FROM FgL.vw_Label_PrintSummary WHERE BatchNo = @BatchNo";
                var batchInfo = await db.QueryFirstOrDefaultAsync(sql, new { BatchNo = batchNo });
                
                if (batchInfo == null)
                {
                    logger.LogWarning("Batch not found: {BatchNo}", batchNo);
                    return Results.NotFound();
                }
                
                logger.LogInformation("Successfully retrieved batch info for BatchNo: {BatchNo}", batchNo);
                return Results.Ok(batchInfo);
            }
            catch (SqlException ex)
            {
                logger.LogError(ex, "SQL Error getting batch info for BatchNo: {BatchNo}, Error: {Message}", batchNo, ex.Message);
                return Results.Problem($"Database error: {ex.Message}", statusCode: 500);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error getting batch info for BatchNo: {BatchNo}, Error: {Message}", batchNo, ex.Message);
                return Results.Problem($"Error getting batch info: {ex.Message}", statusCode: 500);
            }
        }).RequireAuthorization();

        /* ---------- 4.2.2  GET /api/batches/labelview ----------------------- */
        app.MapGet("/api/batches/labelview", async ([FromQuery] string? batchNo, [FromQuery] string? bagNo, [FromServices] IDbConnection db, ILogger<Program> logger, [FromServices] ITemplateService templateService) =>
        {
            try
            {
                logger.LogInformation("Getting label data with parameters: BatchNo={BatchNo}, BagNo={BagNo}", batchNo, bagNo);
                
                // ถ้าไม่มีพารามิเตอร์ให้จำกัดจำนวนเรคอร์ดที่ส่งกลับเพื่อป้องกันความผิดพลาด
                if (string.IsNullOrEmpty(batchNo))
                {
                    // ส่งกลับเฉพาะ 20 รายการล่าสุดเพื่อป้องกัน slow queries
                    string sql = @"
                        SELECT TOP (20) * 
                        FROM FgL.vw_Label_PrintSummary WITH (NOLOCK)
                        WHERE BatchNo IS NOT NULL AND BatchNo NOT LIKE '%.%'  -- กรองบัตชที่มีจุด
                        ORDER BY BatchTicketDate DESC";
                        
                    try
                    {
                        // กำหนด timeout ที่เหมาะสม (30 วินาที)
                        var cmdDef = new CommandDefinition(
                            sql,
                            new { },  // ไม่มีพารามิเตอร์
                            commandTimeout: 30 // 30 วินาที
                        );
                        
                        var result = await db.QueryAsync<FgLabel.Api.Models.LabelRowDto>(cmdDef);
                        logger.LogInformation("Successfully retrieved limited label data. Count: {Count}", result.Count());
                        return Results.Ok(result);
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Error in default query: {Message}", ex.Message);
                        // ส่งกลับอาร์เรย์ว่างในกรณีเกิดข้อผิดพลาด
                        return Results.Ok(Array.Empty<object>());
                    }
                }
                
                // ตรวจสอบรูปแบบของ batchNo
                if (batchNo.Contains(".") || batchNo.Contains(" ") || !batchNo.All(c => char.IsLetterOrDigit(c)))
                {
                    logger.LogWarning("Invalid BatchNo format: {BatchNo}", batchNo);
                    return Results.BadRequest(new { error = "Invalid BatchNo format" });
                }
                
                try
                {
                    // เรียกใช้ stored procedure แทนการ query view โดยตรง
                    string storedProc = "FgL.usp_GetLabelDataByBatchNo";
                    
                    // สร้าง parameters สำหรับ stored procedure
                    var parameters = new DynamicParameters();
                    parameters.Add("@BatchNo", batchNo);
                    
                    // ถ้ามี bagNo ให้ส่งไปด้วย
                    if (!string.IsNullOrEmpty(bagNo))
                    {
                        parameters.Add("@BagNo", bagNo);
                    }
                    
                    // กำหนด timeout ที่เหมาะสม (30 วินาที)
                    var cmdDef = new CommandDefinition(
                        storedProc,
                        parameters,
                        commandType: CommandType.StoredProcedure,
                        commandTimeout: 30 // 30 วินาที
                    );
                    
                    var resultWithParams = await db.QueryAsync<FgLabel.Api.Models.LabelRowDto>(cmdDef);
                    
                    // ตรวจสอบว่ามีผลลัพธ์หรือไม่
                    if (resultWithParams.Any())
                    {
                        // Auto-create template ถ้าไม่มี
                        var firstRow = resultWithParams.First();
                        if (firstRow != null && 
                            firstRow.TemplateID == null && 
                            !string.IsNullOrEmpty(firstRow.ItemKey))
                        {
                            var productKey = firstRow.ItemKey;
                            var customerKey = firstRow.CustKey;
                            
                            try
                            {
                                // Auto-create template
                                var request = new FgLabel.Api.Models.AutoCreateRequest 
                                { 
                                    BatchNo = batchNo,
                                    ProductKey = productKey,
                                    CustomerKey = customerKey ?? string.Empty  // ป้องกัน null assignment
                                };
                                var templateId = await templateService.AutoCreateTemplateAsync(request);
                                
                                if (templateId > 0)
                                {
                                    // เพิ่มข้อมูล template ให้กับทุก row ใน resultWithParams
                                    var template = await db.QueryFirstOrDefaultAsync<LabelTemplateDto>(
                                        "SELECT * FROM FgL.LabelTemplate WHERE TemplateID = @Id", 
                                        new { Id = templateId });
                                        
                                    if (template != null)
                                    {
                                        // ทำการ clone resultWithParams เพื่อแก้ไขข้อมูล template
                                        var updatedResult = resultWithParams.Select(row => {
                                            var newRow = row;
                                            newRow.TemplateID = template.TemplateID;
                                            newRow.TemplateName = template.Name;
                                            newRow.TemplateUpdatedAt = template.UpdatedAt;
                                            return newRow;
                                        }).ToList();
                                        
                                        resultWithParams = updatedResult;
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                logger.LogError(ex, "Error auto-creating template: {Message}", ex.Message);
                            }
                        }
                    }
                    
                    logger.LogInformation("Successfully retrieved label data with params. Count: {Count}", resultWithParams.Count());
                    return Results.Ok(resultWithParams);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error in stored procedure query: {Message}", ex.Message);
                    return Results.Ok(Array.Empty<object>());
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error retrieving label data: {Message}", ex.Message);
                return Results.Problem(
                    title: "Error retrieving label data",
                    detail: ex.Message,
                    statusCode: 500
                );
            }
        }).RequireAuthorization();

        /* ---------- 4.2.3  GET /api/batches/sqlview ----------------------- */
        app.MapGet("/api/batches/sqlview", async ([FromQuery] string batchNo, [FromServices] IDbConnection db, ILogger<Program> logger) =>
        {
            try
            {
                if (string.IsNullOrEmpty(batchNo))
                {
                    return Results.BadRequest("Parameter batchNo is required");
                }

                logger.LogInformation($"Fetching data directly from SQL View for batchNo: {batchNo}");

                // คิวรี่ข้อมูลจาก SQL View โดยตรง
                var sql = @"
                    SELECT * FROM FgL.vw_Label_PrintSummary 
                    WHERE BatchNo = @BatchNo
                    ORDER BY ItemKey, CustKey";

                var result = await db.QueryAsync(sql, new { BatchNo = batchNo });

                if (!result.Any())
                {
                    logger.LogWarning($"No data found in SQL View for batchNo: {batchNo}");
                    return Results.NotFound($"No data found for batch: {batchNo}");
                }

                logger.LogInformation($"Successfully retrieved {result.Count()} records from SQL View for batchNo: {batchNo}");
                
                // บันทึกข้อมูล ShipToCountry เพื่อการดีบัก
                foreach (var row in result)
                {
                    string custKey = row.CustKey?.ToString() ?? "N/A";
                    string itemKey = row.ItemKey?.ToString() ?? "N/A";
                    string shipToCountry = row.SHIPTO_COUNTRY?.ToString() ?? "null";
                    
                    logger.LogInformation($"Record CustKey: {custKey}, ItemKey: {itemKey}, ShipToCountry: {shipToCountry}");
                }

                return Results.Ok(result);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, $"Error fetching data from SQL View for batchNo: {batchNo}");
                return Results.Problem($"Internal server error: {ex.Message}", statusCode: 500);
            }
        }).RequireAuthorization();

        /* ---------- 4.3  POST /api/templates/auto-create ------------------- */
        app.MapPost("/api/templates/auto-create", async (
            FgLabel.Api.Models.AutoCreateRequest request,
            [FromServices] ITemplateService templateService) =>
        {
            var templateId = await templateService.AutoCreateTemplateAsync(request);
            return Results.Ok(new { templateId });
        }).RequireAuthorization();

        /* ---------- 4.4  POST /api/jobs ----------------------------------- */
        app.MapPost("/api/jobs", async (
               FgLabel.Api.Models.JobRequest body,
               ITemplateService templateService,
               IDbConnection db,
               IPrintService printService,
               IHubContext<Hubs.JobHub> hub,
               ILogger<Program> logger) =>
        {
            try
            {
                // ตรวจสอบพารามิเตอร์ที่จำเป็น
                if (string.IsNullOrEmpty(body.BatchNo))
                {
                    return Results.BadRequest(new { error = "BatchNo is required" });
                }
                
                // กำหนดค่าเริ่มต้นหากไม่ได้ระบุ
                if (body.Copies < 1)
                {
                    body.Copies = 1; // ถ้าไม่ระบุจำนวนที่จะพิมพ์ ให้ค่าเริ่มต้นเป็น 1
                }
                
                logger.LogInformation("Creating print job for batch {BatchNo}, copies {Copies}", 
                    body.BatchNo, body.Copies);
                
                // รับหรือสร้าง template ถ้ายังไม่มี TemplateId
                int templateId = body.TemplateId ?? 0;
                if (templateId <= 0)
                {
                    // ใช้ mapping service เพื่อหา template ที่เหมาะสม
                    templateId = await templateService.GetMappingForBatchAsync(body.BatchNo);
                    
                    // ถ้ายังไม่มี template ให้สร้างอัตโนมัติ
                    if (templateId <= 0)
                    {
                        logger.LogInformation("No template found for batch {BatchNo}, creating one automatically", body.BatchNo);
                        var request = new FgLabel.Api.Models.AutoCreateRequest
                        {
                            BatchNo = body.BatchNo,
                            ProductKey = body.ProductKey,
                            CustomerKey = body.CustomerKey
                        };
                        templateId = await templateService.AutoCreateTemplateAsync(request);
                        
                        if (templateId <= 0)
                        {
                            logger.LogWarning("Failed to create template for batch {BatchNo}", body.BatchNo);
                            return Results.BadRequest(new { error = "Unable to create template for batch" });
                        }
                    }
                }
                
                // บันทึกงานพิมพ์ลงในฐานข้อมูล - ใช้พารามิเตอร์จาก JobRequest
                var sql = @"
                    INSERT INTO FgL.LabelPrintJob (BatchNo, TemplateID, PrinterID, Copies, Status, PrintedAt)
                    OUTPUT INSERTED.JobID
                    VALUES (@BatchNo, @TemplateID, @PrinterID, @Copies, @Status, SYSUTCDATETIME())";
                
                var jobId = await db.ExecuteScalarAsync<long>(sql, new { 
                    body.BatchNo, 
                    TemplateID = templateId,
                    PrinterID = body.PrinterId,
                    body.Copies,
                    Status = body.Status ?? "queued"
                });
                
                logger.LogInformation("Created print job {JobId} for batch {BatchNo}", jobId, body.BatchNo);
                
                // ส่งงานไปที่ RabbitMQ
                var factory = new ConnectionFactory
                {
                    HostName = Environment.GetEnvironmentVariable("RABBITMQ__HostName") ?? "localhost",
                    UserName = Environment.GetEnvironmentVariable("RABBITMQ__UserName") ?? "guest",
                    Password = Environment.GetEnvironmentVariable("RABBITMQ__Password") ?? "guest"
                };
                
                using var mqConn = factory.CreateConnection();
                using var ch = mqConn.CreateModel();
                ch.QueueDeclare("print-jobs", true, false, false);
                
                // สร้าง message ที่มีรายละเอียดตามที่ frontend ต้องการ
                var printMessage = new
                {
                    jobId,
                    body.BatchNo,
                    templateId,
                    body.Copies,
                    body.PrinterId,
                    startBag = body.StartBag ?? 1,
                    endBag = body.EndBag ?? body.StartBag ?? 1,
                    body.QcSample,
                    body.FormSheet,
                    body.PalletTag,
                    body.ProductKey,
                    body.CustomerKey,
                    quantity = body.Quantity ?? body.Copies
                };
                
                var msgBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(printMessage));
                
                ch.BasicPublish("", "print-jobs", null, msgBytes);
                logger.LogInformation("Published print job {JobId} to RabbitMQ", jobId);
                
                // แจ้งเตือนผ่าน SignalR
                await hub.Clients.All.SendAsync("job:update", new { jobId, status = body.Status ?? "queued" });
                
                return Results.Ok(new { jobId });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error creating print job: {Message}", ex.Message);
                return Results.Problem(
                    title: "Error creating print job",
                    detail: ex.Message,
                    statusCode: 500
                );
            }
        }).RequireAuthorization();

        /* ---------- 4.5  SignalR hub route ------------------------------- */
        Console.WriteLine("[FgLabel] Mapping SignalR hub to /hubs/job");
        app.MapHub<Hubs.JobHub>("/hubs/job").RequireAuthorization();

        /* ---------- 4.6  GET /api/me --------------------------------------- */
        app.MapGet("/api/me", (ClaimsPrincipal user) =>
            Results.Ok(new
            {
                id = user.Identity?.Name,
                username = user.Identity?.Name,
                role = "user"
            }))
           .RequireAuthorization();

        /* ---------- 4.7  GET /api/templates ------------------------------- */
        app.MapGet("/api/templates", async ([FromServices] ILabelTemplateRepository templateRepo, [FromServices] IDbConnection db, [FromServices] ILogger<Program> logger) =>
        {
            try 
            {
                logger.LogInformation("Retrieving all active templates");
                var templates = (await templateRepo.GetAllActiveTemplates()).ToList();
                
                // สร้าง list ใหม่เพื่อเก็บ templates พร้อม components
                var result = new List<LabelTemplate>();
                
                // ดึงข้อมูล components สำหรับแต่ละ template
                foreach (var tpl in templates)
                {
                    var components = await db.QueryAsync<LabelTemplateComponent>(
                        "SELECT * FROM FgL.LabelTemplateComponent WHERE TemplateID = @Id", 
                        new { Id = tpl.TemplateID });
                    
                    // สร้าง LabelTemplate ใหม่จาก tpl
                    var newTemplate = new LabelTemplate
                    {
                        TemplateID = tpl.TemplateID,
                        Name = tpl.Name,
                        Description = tpl.Description,
                        Engine = tpl.Engine,
                        PaperSize = tpl.PaperSize,
                        Orientation = tpl.Orientation,
                        Content = tpl.Content,
                        ProductKey = tpl.ProductKey,
                        CustomerKey = tpl.CustomerKey,
                        Version = tpl.Version,
                        Active = tpl.Active,
                        CreatedAt = tpl.CreatedAt,
                        UpdatedAt = tpl.UpdatedAt,
                        Components = components.ToList()
                    };
                    
                    result.Add(newTemplate);
                }
                
                logger.LogInformation("Successfully retrieved {Count} templates", result.Count);
                return Results.Ok(result);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error retrieving templates: {Message}", ex.Message);
                return Results.Problem(
                    title: "Error retrieving templates",
                    detail: ex.Message,
                    statusCode: 500
                );
            }
        }).RequireAuthorization();

        /* ---------- 4.7.0  GET /api/templates/{id} --------------------------- */
        app.MapGet("/api/templates/{id}", async (int id, [FromServices] IDbConnection db, [FromServices] ILogger<Program> logger) =>
        {
            try
            {
                logger.LogInformation("Retrieving template ID: {TemplateId}", id);
                
                // ค้นหาเทมเพลตในฐานข้อมูล
                var template = await db.QuerySingleOrDefaultAsync<LabelTemplateDto>(
                    "SELECT * FROM FgL.LabelTemplate WHERE TemplateID = @Id", 
                    new { Id = id });
                    
                if (template == null)
                {
                    logger.LogWarning("Template ID {TemplateId} not found", id);
                    return Results.NotFound(new { message = $"Template with ID {id} not found" });
                }
                
                // ดึงข้อมูล Components
                var components = await db.QueryAsync<LabelTemplateComponent>(
                    "SELECT * FROM FgL.LabelTemplateComponent WHERE TemplateID = @Id",
                    new { Id = id });
                    
                // สร้าง response object
                var result = new
                {
                    template.TemplateID,
                    template.Name,
                    template.Description,
                    template.Engine,
                    template.PaperSize,
                    template.Orientation,
                    template.Content,
                    template.ProductKey,
                    template.CustomerKey,
                    template.Version,
                    template.Active,
                    template.CreatedAt,
                    template.UpdatedAt,
                    Components = components.ToList()
                };
                
                logger.LogInformation("Template ID {TemplateId} retrieved successfully with {ComponentCount} components", 
                    id, components.Count());
                return Results.Ok(result);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error retrieving template ID {TemplateId}: {Message}", id, ex.Message);
                return Results.Problem(
                    title: "Error retrieving template",
                    detail: ex.Message,
                    statusCode: 500
                );
            }
        }).RequireAuthorization();

        /* ---------- 4.7.1  GET /api/templates/starters --------------------- */
        app.MapGet("/api/templates/starters", async ([FromServices] IDbConnection db) =>
        {
            var templates = (await db.QueryAsync<LabelTemplateDto>(
                "SELECT * FROM FgL.LabelTemplate WHERE Active = 1 ORDER BY TemplateID ASC")).ToList();
            var result = new List<dynamic>();
            
            foreach (var tpl in templates)
            {
                var components = await db.QueryAsync<LabelTemplateComponent>(
                    "SELECT * FROM FgL.LabelTemplateComponent WHERE TemplateID = @Id", 
                    new { Id = tpl.TemplateID });
                
                // สร้าง dynamic object เพื่อส่งกลับไปยัง client
                var template = new
                {
                    tpl.TemplateID,
                    tpl.Name,
                    tpl.Description,
                    tpl.Engine,
                    tpl.PaperSize,
                    tpl.Orientation,
                    tpl.Content,
                    tpl.ProductKey,
                    tpl.CustomerKey,
                    tpl.Version,
                    tpl.Active,
                    tpl.CreatedAt,
                    tpl.UpdatedAt,
                    Components = components.ToList()
                };
                
                result.Add(template);
            }
            
            return Results.Ok(result);
        }).RequireAuthorization();

        /* ---------- 5.1  GET /api/batch/{batchNo}/preview -------------------- */
        app.MapGet("/api/batch/{batchNo}/preview", async (string batchNo, IDbConnection db, ILogger<Program> logger) =>
        {
            try
            {
                logger.LogInformation("Fetching preview data for batch: {BatchNo}", batchNo);
                
                // Query data from the view
                var sql = @"
                    SELECT 
                        b.BatchNo, b.BagNo, b.ProductName, b.CustomerName, b.ProductionDate,
                        b.ExpiryDate, b.ItemKey AS ProductKey, b.CustKey AS CustomerKey,
                        t.TemplateID, t.Name AS TemplateName, t.Version, t.Engine, 
                        t.PaperSize, t.Content
                    FROM FgL.vw_Label_PrintSummary b
                    LEFT JOIN FgL.LabelTemplateMapping m ON 
                        (m.ProductKey = b.ItemKey OR m.ProductKey IS NULL) AND 
                        (m.CustomerKey = b.CustKey OR m.CustomerKey IS NULL) AND
                        m.IsActive = 1
                    LEFT JOIN FgL.LabelTemplate t ON m.TemplateID = t.TemplateID
                    WHERE b.BatchNo = @BatchNo
                    ORDER BY 
                        CASE WHEN m.ProductKey IS NOT NULL AND m.CustomerKey IS NOT NULL THEN 1
                             WHEN m.ProductKey IS NOT NULL THEN 2
                             WHEN m.CustomerKey IS NOT NULL THEN 3
                             ELSE 4 END";
                
                var dataRows = (await db.QueryAsync(sql, new { BatchNo = batchNo })).ToList();
                
                if (!dataRows.Any())
                {
                    return Results.NotFound($"No data found for batch: {batchNo}");
                }
                
                // Get template information
                var firstRow = dataRows.First();
                int? templateID = firstRow.TemplateID;
                var engine = firstRow.Engine as string;
                var paperSize = firstRow.PaperSize as string;
                var content = firstRow.Content as string;
                var isAutoGenerated = false;
                
                // If no template found, auto-generate a default template
                if (templateID == null || content == null)
                {
                    // Create a default template using first record data
                    var defaultTemplate = GenerateDefaultTemplate(firstRow);
                    content = defaultTemplate.Content;
                    engine = defaultTemplate.Engine;
                    paperSize = defaultTemplate.PaperSize;
                    isAutoGenerated = true;
                    
                    logger.LogInformation("Auto-generated template for batch {BatchNo}", batchNo);
                }
                
                return Results.Ok(new
                {
                    templateID,
                    engine,
                    paperSize,
                    content,
                    isAutoGenerated,
                    dataRows
                });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error fetching preview data for batch {BatchNo}: {Message}", batchNo, ex.Message);
                return Results.Problem(
                    title: "Error fetching preview data",
                    detail: ex.Message,
                    statusCode: 500
                );
            }
        }).RequireAuthorization();

        // Helper method to generate a default template if none exists
        static dynamic GenerateDefaultTemplate(dynamic data)
        {
            // Create a simple default template based on data
            var elements = new List<object>
            {
                new {
                    id = Guid.NewGuid().ToString(),
                    type = "text",
                    x = 20,
                    y = 20,
                    width = 360,
                    height = 40,
                    text = $"Batch: {data.BatchNo}",
                    fontSize = 24,
                    fontFamily = "Arial",
                    fontWeight = "bold",
                    fill = "#000000",
                    align = "left"
                },
                new {
                    id = Guid.NewGuid().ToString(),
                    type = "text",
                    x = 20,
                    y = 70,
                    width = 360,
                    height = 30,
                    text = $"Product: {data.ProductName}",
                    fontSize = 18,
                    fontFamily = "Arial",
                    fill = "#000000",
                    align = "left"
                },
                new {
                    id = Guid.NewGuid().ToString(),
                    type = "text",
                    x = 20,
                    y = 110,
                    width = 360,
                    height = 30,
                    text = $"Customer: {data.CustomerName}",
                    fontSize = 18,
                    fontFamily = "Arial",
                    fill = "#000000",
                    align = "left"
                },
                new {
                    id = Guid.NewGuid().ToString(),
                    type = "text",
                    x = 20,
                    y = 150,
                    width = 180,
                    height = 30,
                    text = $"Bag: {data.BagNo}",
                    fontSize = 18,
                    fontFamily = "Arial",
                    fill = "#000000",
                    align = "left"
                },
                new {
                    id = Guid.NewGuid().ToString(),
                    type = "barcode",
                    x = 20,
                    y = 190,
                    width = 300,
                    height = 80,
                    value = $"{data.BatchNo}-{data.BagNo}",
                    format = "CODE128",
                    fill = "#000000"
                }
            };
            
            var templateContent = new {
                canvasSize = new { width = 400, height = 300 },
                elements
            };
            
            var contentJson = JsonSerializer.Serialize(templateContent);
            
            return new
            {
                Content = contentJson,
                Engine = "html",
                PaperSize = "4X4"
            };
        }

        /* ---------- 4.8  POST /api/templates ------------------------------- */
        app.MapPost("/api/templates", async (HttpRequest request, IDbConnection db, ILogger<Program> logger) =>
        {
            try
            {
                // Parse request body
                var body = await new StreamReader(request.Body).ReadToEndAsync();
                var template = JsonSerializer.Deserialize<JsonElement>(body);
                
                // Extract template details
                var name = template.GetProperty("name").GetString();
                var description = template.TryGetProperty("description", out var descProp) ? descProp.GetString() : null;
                var engine = template.TryGetProperty("engine", out var engineProp) ? engineProp.GetString() : "html";
                var paperSize = template.TryGetProperty("paperSize", out var paperSizeProp) ? paperSizeProp.GetString() : "4X4";
                var orientation = template.TryGetProperty("orientation", out var oriProp) ? oriProp.GetString() : null;
                var productKey = template.TryGetProperty("productKey", out var prodKeyProp) ? prodKeyProp.GetString() : null;
                var customerKey = template.TryGetProperty("customerKey", out var custKeyProp) ? custKeyProp.GetString() : null;
                var content = template.TryGetProperty("content", out var contentProp) ? contentProp.GetString() : null;
                var templateType = template.TryGetProperty("templateType", out var templateTypeProp) ? templateTypeProp.GetString() : 
                                  (template.TryGetProperty("labelType", out var labelTypeProp) ? labelTypeProp.GetString() : "Standard");
                
                var incrementVersion = template.TryGetProperty("incrementVersion", out var incrVerProp) && incrVerProp.GetBoolean();
                
                // Check for existing template ID for update case
                int? templateID = null;
                if (template.TryGetProperty("templateID", out var idProp))
                {
                    templateID = idProp.TryGetInt32(out var id) ? id : null;
                }
                else if (template.TryGetProperty("id", out var id2Prop))
                {
                    templateID = id2Prop.TryGetInt32(out var id) ? id : null;
                }
                
                if (string.IsNullOrEmpty(name))
                {
                    return Results.BadRequest("Template name is required");
                }
                
                if (templateID.HasValue)
                {
                    // Update existing template
                    var existingTemplate = await db.QuerySingleOrDefaultAsync<dynamic>(
                        "SELECT * FROM FgL.LabelTemplate WHERE TemplateID = @TemplateID", 
                        new { TemplateID = templateID });
                        
                    if (existingTemplate == null)
                    {
                        return Results.NotFound($"Template with ID {templateID} not found");
                    }
                    
                    var currentVersion = (int)existingTemplate.Version;
                    var newVersion = incrementVersion ? currentVersion + 1 : currentVersion;
                    
                    var updateSql = @"
                        UPDATE FgL.LabelTemplate SET
                            Name = @Name, 
                            Description = @Description, 
                            Engine = @Engine, 
                            PaperSize = @PaperSize, 
                            Orientation = @Orientation,
                            Content = @Content,
                            ProductKey = @ProductKey,
                            CustomerKey = @CustomerKey,
                            TemplateType = @TemplateType,
                            UpdatedAt = GETDATE(),
                            Version = @Version,
                            Active = 1
                        WHERE TemplateID = @TemplateID;
                        
                        SELECT @TemplateID AS TemplateID, @Version AS Version;";
                        
                    var result = await db.QuerySingleAsync<dynamic>(
                        updateSql,
                        new {
                            Name = name,
                            Description = description,
                            Engine = engine,
                            PaperSize = paperSize,
                            Orientation = orientation,
                            Content = content,
                            ProductKey = productKey,
                            CustomerKey = customerKey,
                            TemplateType = templateType,
                            Version = newVersion,
                            TemplateID = templateID
                        });
                    
                    logger.LogInformation("Updated template ID {TemplateID}, version {Version}", (object)templateID, (object)newVersion);
                    
                    // อัปเดต mapping ใน table mapping ด้วย stored procedure
                    try
                    {
                        await db.ExecuteAsync(
                            "FgL.UpdateTemplateMappingWithStringKeys", 
                            new { 
                                TemplateID = templateID,
                                ProductKey = productKey,
                                CustomerKey = customerKey
                            },
                            commandType: System.Data.CommandType.StoredProcedure);
                        
                        logger.LogInformation("Updated template mapping for template ID {TemplateID}", (object)templateID);
                    }
                    catch (Exception ex)
                    {
                        // บันทึก error แต่ไม่หยุดการทำงาน เนื่องจากการอัปเดต template สำเร็จแล้ว
                        logger.LogWarning(ex, "Error updating template mapping for ID {TemplateID}, but template update succeeded", (object)templateID);
                    }
                    
                    return Results.Ok(result);
                }
                else
                {
                    // Create new template
                    var insertSql = @"
                        INSERT INTO FgL.LabelTemplate (
                            Name, Description, ProductKey, CustomerKey, 
                            Engine, PaperSize, Orientation, Content, Version,
                            CreatedAt, UpdatedAt, Active, TemplateType
                        ) VALUES (
                            @Name, @Description, @ProductKey, @CustomerKey,
                            @Engine, @PaperSize, @Orientation, @Content, 1,
                            GETDATE(), GETDATE(), 1, @TemplateType
                        );
                        
                        SELECT SCOPE_IDENTITY() AS TemplateID, 1 AS Version;";
                        
                    var result = await db.QueryFirstAsync<dynamic>(insertSql, new
                    {
                        Name = name,
                        Description = description,
                        ProductKey = productKey,
                        CustomerKey = customerKey,
                        Engine = engine,
                        PaperSize = paperSize,
                        Orientation = orientation,
                        Content = content,
                        TemplateType = templateType
                    });
                    
                    var newTemplateId = (int)result.TemplateID;
                    logger.LogInformation("Created new template ID {TemplateID}", (object)newTemplateId);
                    
                    // อัปเดต mapping ใน table mapping ด้วย stored procedure
                    try
                    {
                        await db.ExecuteAsync(
                            "FgL.UpdateTemplateMappingWithStringKeys", 
                            new { 
                                TemplateID = newTemplateId,
                                ProductKey = productKey,
                                CustomerKey = customerKey
                            },
                            commandType: System.Data.CommandType.StoredProcedure);
                        
                        logger.LogInformation("Created template mapping for template ID {TemplateID}", (object)newTemplateId);
                    }
                    catch (Exception ex)
                    {
                        // บันทึก error แต่ไม่หยุดการทำงาน เนื่องจากการสร้าง template สำเร็จแล้ว
                        logger.LogWarning(ex, "Error creating template mapping for ID {TemplateID}, but template creation succeeded", (object)newTemplateId);
                    }
                    
                    return Results.Created($"/api/templates/{newTemplateId}", result);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error creating/updating template: {Message}", ex.Message);
                return Results.Problem(
                    title: "Error processing template",
                    detail: ex.Message,
                    statusCode: 500
                );
            }
        }).RequireAuthorization();

        /* ---------- 2.3 Create Standard Template ----------- */
        app.MapPost("/api/templates/create-standard", async ([FromBody] FgLabel.Api.Models.AutoCreateRequest request, HttpContext httpContext, IDbConnection db, ITemplateService templateService) =>
        {
            if (string.IsNullOrEmpty(request.BatchNo))
            {
                return Results.BadRequest(new { error = "BatchNo is required" });
            }

            try
            {
                // Call the template service to create standard template
                var templateId = await templateService.AutoCreateTemplateAsync(request);
                if (templateId <= 0)
                {
                    return Results.Problem("Failed to create template.");
                }
                
                // Retrieve the created template
                var savedTemplate = await db.QueryFirstOrDefaultAsync<LabelTemplateDto>(
                    "SELECT * FROM FgL.LabelTemplate WHERE TemplateID = @Id", 
                    new { Id = templateId });
                    
                return Results.Ok(savedTemplate);
            }
            catch (Exception ex)
            {
                return Results.Problem($"Error creating standard template: {ex.Message}");
            }
        }).RequireAuthorization();

        /* ---------- 4.9  DELETE /api/templates/{id} ------------------------------- */
        app.MapDelete("/api/templates/{id}", async (int id, IDbConnection db, ILogger<Program> logger, ITemplateService templateService) =>
        {
            try
            {
                logger.LogInformation("Deleting template ID {TemplateID}", id);
                
                // ตรวจสอบว่ามี template นี้หรือไม่
                var template = await db.QueryFirstOrDefaultAsync<dynamic>(
                    "SELECT TemplateID FROM FgL.LabelTemplate WHERE TemplateID = @TemplateID AND Active = 1", 
                    new { TemplateID = id });
                    
                if (template == null)
                {
                    return Results.NotFound($"Template with ID {id} not found or already inactive");
                }
                
                // เรียกใช้ service method ที่มีอยู่แล้วเพื่อลบ template
                var success = await templateService.DeleteTemplateAsync(id);
                
                if (!success)
                {
                    return Results.Problem(
                        title: "Failed to delete template",
                        statusCode: 500
                    );
                }
                
                logger.LogInformation("Successfully deleted template ID {TemplateID}", id);
                return Results.NoContent();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error deleting template {TemplateID}: {Message}", id, ex.Message);
                return Results.Problem(
                    title: "Error deleting template",
                    detail: ex.Message,
                    statusCode: 500
                );
            }
        }).RequireAuthorization();

        /* ---------- 4.15 GET /api/templates/lookup ------------------------------ */
        app.MapGet("/api/templates/lookup", async (HttpContext ctx, IDbConnection connection, string? productKey, string? customerKey, string? labelType, string? shipToCountry, ILogger<Program> logger) =>
        {
            if (string.IsNullOrEmpty(productKey) && string.IsNullOrEmpty(customerKey))
            {
                return Results.BadRequest(new { message = "At least one of productKey or customerKey must be provided" });
            }
            
            try
            {
                // ใช้ค่า labelType ที่รับมา ถ้าไม่มีให้ใช้ค่าเริ่มต้นเป็น Standard
                string templateType = !string.IsNullOrEmpty(labelType) ? labelType : "Standard";
                string shipToCountryValue = shipToCountry ?? "";
                
                logger.LogInformation(
                    "Looking up template with productKey={0}, customerKey={1}, templateType={2}, shipToCountry={3}", 
                    productKey ?? "(null)", 
                    customerKey ?? "(null)", 
                    templateType,
                    shipToCountryValue);
                
                // เรียกใช้ stored procedure ค้นหา template โดยใช้ productKey และ customerKey
                var result = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "FgL.GetTemplateByProductAndCustomerKeys",
                    new { productKey, customerKey, templateType, shipToCountry = shipToCountryValue },
                    commandType: System.Data.CommandType.StoredProcedure
                );
                
                // ถ้าไม่พบ template จะได้ result ที่มีค่า templateID เป็น null
                if (result == null)
                {
                    logger.LogWarning(
                        "No template found for productKey={0}, customerKey={1}, templateType={2}, shipToCountry={3}", 
                        productKey ?? "(null)", 
                        customerKey ?? "(null)", 
                        templateType,
                        shipToCountryValue);
                    return Results.NotFound(new { message = $"No template found for the specified product and customer keys with type {templateType}" });
                }
                
                var templateId = result?.TemplateID;
                if (templateId == null)
                {
                    logger.LogWarning(
                        "Template ID is null for productKey={0}, customerKey={1}, templateType={2}, shipToCountry={3}", 
                        productKey ?? "(null)", 
                        customerKey ?? "(null)", 
                        templateType,
                        shipToCountryValue);
                    return Results.NotFound(new { message = $"No template found for the specified product and customer keys with type {templateType}" });
                }
                
                logger.LogInformation($"Found template ID: {templateId}");
                return Results.Ok(new { templateID = templateId });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, 
                    "Error looking up template by product key {0}, customer key {1}, label type {2}, shipToCountry {3}",
                    productKey ?? "(null)", 
                    customerKey ?? "(null)",
                    labelType ?? "Standard",
                    shipToCountry ?? "(null)");
                return Results.Problem(
                    title: "Error looking up template",
                    detail: ex.Message,
                    statusCode: 500
                );
            }
        }).RequireAuthorization();

        // เพิ่ม endpoint เดิม /templates/lookup เพื่อรักษาความเข้ากันได้กับการเรียกใช้งานเดิม
        app.MapGet("/templates/lookup", async (HttpContext ctx, IDbConnection connection, string? productKey, string? customerKey, string? labelType, string? shipToCountry, ILogger<Program> logger) =>
        {
            // เหมือนกับ endpoint /api/templates/lookup
            if (string.IsNullOrEmpty(productKey) && string.IsNullOrEmpty(customerKey))
            {
                return Results.BadRequest(new { message = "At least one of productKey or customerKey must be provided" });
            }
            
            try
            {
                // ใช้ค่า labelType ที่รับมา ถ้าไม่มีให้ใช้ค่าเริ่มต้นเป็น Standard
                string templateType = !string.IsNullOrEmpty(labelType) ? labelType : "Standard";
                string shipToCountryValue = shipToCountry ?? "";
                
                logger.LogInformation(
                    "Legacy lookup template with productKey={0}, customerKey={1}, templateType={2}, shipToCountry={3}", 
                    productKey ?? "(null)", 
                    customerKey ?? "(null)", 
                    templateType,
                    shipToCountryValue);
                
                // เรียกใช้ stored procedure ค้นหา template โดยใช้ productKey และ customerKey
                var result = await connection.QueryFirstOrDefaultAsync<dynamic>(
                    "FgL.GetTemplateByProductAndCustomerKeys",
                    new { productKey, customerKey, templateType, shipToCountry = shipToCountryValue },
                    commandType: System.Data.CommandType.StoredProcedure
                );
                
                // ถ้าไม่พบ template จะได้ result ที่มีค่า templateID เป็น null
                if (result == null)
                {
                    logger.LogWarning(
                        "Legacy - No template found for productKey={0}, customerKey={1}, templateType={2}, shipToCountry={3}", 
                        productKey ?? "(null)", 
                        customerKey ?? "(null)", 
                        templateType,
                        shipToCountryValue);
                    return Results.NotFound(new { message = $"No template found for the specified product and customer keys with type {templateType}" });
                }
                
                var templateId = result?.TemplateID;
                if (templateId == null)
                {
                    logger.LogWarning(
                        "Legacy - Template ID is null for productKey={0}, customerKey={1}, templateType={2}, shipToCountry={3}", 
                        productKey ?? "(null)", 
                        customerKey ?? "(null)", 
                        templateType,
                        shipToCountryValue);
                    return Results.NotFound(new { message = $"No template found for the specified product and customer keys with type {templateType}" });
                }
                
                logger.LogInformation($"Legacy - Found template ID: {templateId}");
                return Results.Ok(new { templateID = templateId });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, 
                    "Legacy - Error looking up template by product key {0}, customer key {1}, label type {2}, shipToCountry {3}",
                    productKey ?? "(null)", 
                    customerKey ?? "(null)",
                    labelType ?? "Standard",
                    shipToCountry ?? "(null)");
                return Results.Problem(
                    title: "Error looking up template",
                    detail: ex.Message,
                    statusCode: 500
                );
            }
        }).RequireAuthorization();

        // Start the application
        await app.RunAsync();
    }
}