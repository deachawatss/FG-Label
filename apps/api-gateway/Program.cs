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
using FgLabel.Shared.Models;
using FgLabel.Shared.Services;
using FgLabel.Shared.Utilities;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Hosting;
using FgLabel.Api.Repositories;
using SharedModels = FgLabel.Shared.Models;

namespace FgLabel.Api;

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
    
    // ฟังก์ชันสำหรับส่งงานพิมพ์เข้าคิว
    private static Task PublishPrintJobToQueue2(int jobId, ILogger logger)
    {
        try
        {
            var rabbitmqHostname = Environment.GetEnvironmentVariable("RabbitMQ__HostName") ?? "rabbitmq";
            var rabbitmqUsername = Environment.GetEnvironmentVariable("RabbitMQ__UserName") ?? "guest";
            var rabbitmqPassword = Environment.GetEnvironmentVariable("RabbitMQ__Password") ?? "guest";
                
            var factory = new ConnectionFactory
            {
                HostName = rabbitmqHostname,
                UserName = rabbitmqUsername,
                Password = rabbitmqPassword
            };
                
            using var connection = factory.CreateConnection();
            using var channel = connection.CreateModel();
                
            // Ensure queue exists
            channel.QueueDeclare(
                queue: "print-jobs",
                durable: true,
                exclusive: false,
                autoDelete: false,
                arguments: null);
                    
            // Create message
            var message = new
            {
                JobID = jobId
            };
                
            // Convert to JSON and publish
            var messageBody = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(message));
                
            channel.BasicPublish(
                exchange: "",
                routingKey: "print-jobs",
                basicProperties: null,
                body: messageBody);
                    
            logger.LogInformation("Print job {JobId} published to queue", jobId);
            
            return Task.CompletedTask;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error publishing print job {JobID} to queue: {Message}", jobId, ex.Message);
            // Don't rethrow, we still want to return success to the client
            return Task.CompletedTask;
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
        builder.Services.AddScoped<ILabelTemplateRepository>(sp => 
            new LabelTemplateRepository(
                sp.GetRequiredService<IConfiguration>().GetConnectionString("DefaultConnection")!,
                sp.GetRequiredService<ILogger<LabelTemplateRepository>>()
            ));

        // Configure LDAP
        var isLdapBypassed = Environment.GetEnvironmentVariable("BYPASS_LDAP")?.ToLower() == "true";
        if (isLdapBypassed)
        {
            Console.WriteLine("[FgLabel] LDAP bypass enabled. Authentication will always succeed in dev mode.");
            Console.WriteLine("[FgLabel] LDAP connection testing skipped due to bypass setting.");
        }
        else
        {
            // Get LDAP configuration from environment variables
            var ldapConfig = new LdapConfig
            {
                Url = Environment.GetEnvironmentVariable("AD__Url") ?? "ldap://192.168.0.1",
                BaseDn = Environment.GetEnvironmentVariable("AD__BaseDn") ?? "OU=Thailand,DC=NWFTH,DC=com",
                Username = Environment.GetEnvironmentVariable("AD__Username") ?? "deachawat@newlywedsfoods.co.th",
                Password = Environment.GetEnvironmentVariable("AD__Password") ?? "Nwfth.c0m2026",
                TimeoutSeconds = 5,
                DefaultDomain = "newlywedsfoods.co.th"
            };

            // Configure LDAP service
            builder.Services.Configure<LdapConfig>(options =>
            {
                options.Url = ldapConfig.Url;
                options.BaseDn = ldapConfig.BaseDn;
                options.Username = ldapConfig.Username;
                options.Password = ldapConfig.Password;
                options.TimeoutSeconds = ldapConfig.TimeoutSeconds;
                options.DefaultDomain = ldapConfig.DefaultDomain;
            });

            builder.Services.AddScoped<ILdapService, LdapService>();
        }

        /* ------------------------------------------------------------------ */
        Console.WriteLine("[FgLabel] Before builder.Build()");
        var app = builder.Build();
        Console.WriteLine("[FgLabel] After builder.Build()");

        // Test LDAP connection after app is built
        if (!isLdapBypassed)
        {
            using var scope = app.Services.CreateScope();
            var ldapService = scope.ServiceProvider.GetRequiredService<ILdapService>();
            var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
            var ldapOptions = scope.ServiceProvider.GetRequiredService<IOptions<LdapConfig>>().Value;

            try
            {
                if (!ldapService.TestConnection())
                {
                    var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
                    if (env == "Development" || env == "dev")
                    {
                        logger.LogWarning("[FgLabel] ⚠️ Warning: LDAP connection failed but continuing in development mode.");
                        logger.LogWarning("[FgLabel] LDAP URL: {Url}", ldapOptions.Url);
                        logger.LogWarning("[FgLabel] LDAP BaseDN: {BaseDn}", ldapOptions.BaseDn);
                    }
                    else
                    {
                        throw new InvalidOperationException("Cannot connect to LDAP server");
                    }
                }
                else
                {
                    logger.LogInformation("[FgLabel] LDAP connection test successful");
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
        app.MapPost("/api/auth/login", async (LoginRequest login, ILdapService? ldap, ILogger<Program> log) =>
        {
            // Mask password in logs
            log.LogInformation("/api/auth/login username: {Username}", login.username);

            try 
            {
                var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
                if (env == "Development" || env == "dev" || ldap == null)
                {
                    // Development mode or LDAP bypass mode
                    var bypassToken = GenerateJwtToken(login.username);
                    log.LogInformation("Login successful in development mode for user: {Username}", login.username);
                    return Results.Ok(new { token = bypassToken, user = new { username = login.username } });
                }

                // LDAP validation can be slow, run it in a background thread to avoid blocking
                var isValid = await Task.Run(() => ldap.ValidateUser(login.username, login.password));
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
        app.MapGet("/api/batch/{batchNo}", async (string batchNo, [FromServices] IBatchRepository batchRepo, ILogger<Program> logger) =>
        {
            try
            {
                Console.WriteLine($"[FgLabel] Getting batch info for BatchNo: {batchNo}");
                var batchInfo = await batchRepo.GetBatchInfoAsync(batchNo);
                if (batchInfo == null)
                {
                    Console.WriteLine($"[FgLabel] Batch not found: {batchNo}");
                    return Results.NotFound();
                }
                Console.WriteLine($"[FgLabel] Successfully retrieved batch info for BatchNo: {batchNo}");
                return Results.Ok(batchInfo);
            }
            catch (SqlException ex)
            {
                Console.WriteLine($"[FgLabel] SQL Error getting batch info for BatchNo: {batchNo}");
                Console.WriteLine($"[FgLabel] SQL Error Number: {ex.Number}");
                Console.WriteLine($"[FgLabel] SQL Error Message: {ex.Message}");
                return Results.Problem($"Database error: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FgLabel] Error getting batch info for BatchNo: {batchNo}");
                Console.WriteLine($"[FgLabel] Error Type: {ex.GetType().Name}");
                Console.WriteLine($"[FgLabel] Error Message: {ex.Message}");
                return Results.Problem($"Error getting batch info: {ex.Message}");
            }
        }).RequireAuthorization();

        /* ---------- 4.2.2  GET /api/batches/labelview ----------------------- */
        app.MapGet("/api/batches/labelview", async ([FromQuery] string? batchNo, [FromQuery] string? lotCode, [FromServices] IDbConnection db, ILogger<Program> logger) =>
        {
            try
            {
                logger.LogInformation("Getting label data with parameters: BatchNo={BatchNo}, LotCode={LotCode}", batchNo, lotCode);
                
                string sql = "SELECT * FROM FgL.vw_Label_PrintData WHERE 1=1";
                var parameters = new DynamicParameters();
                
                if (!string.IsNullOrEmpty(batchNo))
                {
                    sql += " AND BatchNo = @BatchNo";
                    parameters.Add("BatchNo", batchNo);
                }
                
                if (!string.IsNullOrEmpty(lotCode))
                {
                    sql += " AND LotCode = @LotCode";
                    parameters.Add("LotCode", lotCode);
                }
                
                sql += " ORDER BY BatchNo, BagSequence";
                
                var result = await db.QueryAsync(sql, parameters);
                logger.LogInformation("Successfully retrieved label data. Count: {Count}", result.Count());
                return Results.Ok(result);
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

        /* ---------- 4.3  POST /api/templates/auto-create ------------------- */
        app.MapPost("/api/templates/auto-create", async (
            AutoCreateRequest request,
            [FromServices] ITemplateService templateService) =>
        {
            var templateId = await templateService.AutoCreateTemplateAsync(request);
            return Results.Ok(new { templateId });
        }).RequireAuthorization();

        /* ---------- 4.4  POST /api/jobs ----------------------------------- */
        app.MapPost("/api/jobs", async (
                   JobRequest body,
                   ITemplateService templateService,
                   IHubContext<Hubs.JobHub> hub) =>
        {
            using var conn = new SqlConnection(sqlConn);

            // Get or create template
            var templateId = await templateService.CreateOrGetTemplateAsync(body.BatchNo);

            var jobId = await conn.ExecuteScalarAsync<long>(@"
                    INSERT INTO FgL.LabelPrintJob (BatchNo,TemplateID,Copies,Status,PrintedAt)
                    OUTPUT INSERTED.JobID
                    VALUES (@BatchNo,@TemplateID,@Copies,'queued',SYSUTCDATETIME())",
                new { body.BatchNo, TemplateID = templateId, body.Copies });

            // ----- สร้าง factory และ connection ที่นี่ ----- //
            var rabbitHost = app.Configuration["RabbitMQ__HostName"] ?? "localhost";
            var rabbitUser = app.Configuration["RabbitMQ__UserName"] ?? "guest";
            var rabbitPass = app.Configuration["RabbitMQ__Password"] ?? "guest";
            var factory = new ConnectionFactory
            {
                HostName = rabbitHost,
                UserName = rabbitUser,
                Password = rabbitPass
            };
            using var mqConn = factory.CreateConnection();
            using var ch = mqConn.CreateModel();
            ch.QueueDeclare("print-jobs", true, false, false);
            var msgBytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
            {
                jobId,
                body.BatchNo,
                templateId,
                body.Copies
            }));
            ch.BasicPublish("", "print-jobs", null, msgBytes);

            // ----- SignalR push ------------------------------------------ //
            await hub.Clients.All.SendAsync("job:update", new { jobId, status = "queued" });

            return Results.Ok(new { jobId });
        }).RequireAuthorization();

        /* ---------- 4.5  SignalR hub route ------------------------------- */
        app.MapHub<Hubs.JobHub>("/hubs/jobs").RequireAuthorization();

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
                var result = new List<SharedModels.LabelTemplate>();
                
                // ดึงข้อมูล components สำหรับแต่ละ template
                foreach (var tpl in templates)
                {
                    var components = await db.QueryAsync<SharedModels.LabelTemplateComponent>(
                        "SELECT * FROM FgL.LabelTemplateComponent WHERE TemplateID = @Id", 
                        new { Id = tpl.TemplateID });
                    
                    // สร้าง template ใหม่พร้อม components แล้วเพิ่มเข้า list ผลลัพธ์
                    var updatedTemplate = tpl with { Components = components.ToList() };
                    result.Add(updatedTemplate);
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
                var template = await db.QuerySingleOrDefaultAsync<SharedModels.LabelTemplate>(
                    "SELECT * FROM FgL.LabelTemplate WHERE TemplateID = @Id", 
                    new { Id = id });
                    
                if (template == null)
                {
                    logger.LogWarning("Template ID {TemplateId} not found", id);
                    return Results.NotFound(new { message = $"Template with ID {id} not found" });
                }
                
                // ดึงข้อมูล Components
                var components = await db.QueryAsync<SharedModels.LabelTemplateComponent>(
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
            var templates = (await db.QueryAsync<SharedModels.LabelTemplate>(
                "SELECT * FROM FgL.LabelTemplate WHERE Active = 1 ORDER BY TemplateID ASC")).ToList();
            var result = new List<SharedModels.LabelTemplate>();
            
            foreach (var tpl in templates)
            {
                var components = await db.QueryAsync<SharedModels.LabelTemplateComponent>(
                    "SELECT * FROM FgL.LabelTemplateComponent WHERE TemplateID = @Id", 
                    new { Id = tpl.TemplateID });
                result.Add(tpl with { Components = components.ToList() });
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
                    FROM FgL.vw_Label_PrintData b
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
                var productKey = template.TryGetProperty("productKey", out var prodKeyProp) ? prodKeyProp.GetString() : null;
                var customerKey = template.TryGetProperty("customerKey", out var custKeyProp) ? custKeyProp.GetString() : null;
                var content = template.TryGetProperty("content", out var contentProp) ? contentProp.GetString() : null;
                
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
                            Orientation = template.TryGetProperty("orientation", out var oriProp) ? oriProp.GetString() : null,
                            Content = content,
                            ProductKey = productKey,
                            CustomerKey = customerKey,
                            Version = newVersion,
                            TemplateID = templateID
                        });
                    
                    logger.LogInformation("Updated template ID {TemplateID}, version {Version}", (object)templateID, (object)newVersion);
                    
                    return Results.Ok(result);
                }
                else
                {
                    // Create new template
                    var insertSql = @"
                        INSERT INTO FgL.LabelTemplate (
                            Name, Description, ProductKey, CustomerKey, 
                            Engine, PaperSize, Content, Version,
                            CreatedAt, UpdatedAt
                        ) VALUES (
                            @Name, @Description, @ProductKey, @CustomerKey,
                            @Engine, @PaperSize, @Content, 1,
                            GETDATE(), GETDATE()
                        );
                        
                        DECLARE @TemplateID INT = SCOPE_IDENTITY();
                        
                        -- Insert mapping if product or customer key is specified
                        IF @ProductKey IS NOT NULL OR @CustomerKey IS NOT NULL
                        BEGIN
                            INSERT INTO FgL.LabelTemplateMapping (
                                TemplateID, ProductKey, CustomerKey, IsActive, CreatedAt
                            ) VALUES (
                                @TemplateID, @ProductKey, @CustomerKey, 1, GETDATE()
                            );
                        END
                        
                        SELECT @TemplateID AS TemplateID, 1 AS Version;";
                        
                    var result = await db.QueryFirstAsync<dynamic>(insertSql, new
                    {
                        Name = name,
                        Description = description,
                        ProductKey = productKey,
                        CustomerKey = customerKey,
                        Engine = engine,
                        PaperSize = paperSize,
                        Content = content
                    });
                    
                    logger.LogInformation("Created new template ID {TemplateID}", (object)result.TemplateID);
                    
                    return Results.Created($"/api/templates/{result.TemplateID}", result);
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

        // Start the application
        await app.RunAsync();
    }
}