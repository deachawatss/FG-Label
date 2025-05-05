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
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Hosting;
using FgLabel.Api.Repositories;
using SharedModels = FgLabel.Shared.Models;

namespace FgLabel.Api;

public class Program
{
    // JWT configuration loaded once
    private static string _jwtKey = "";
    private static string _jwtIssuer = "FgLabel";
    private static string _jwtAudience = "FgLabel";
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
    private static void ConfigureJwt(JwtBearerOptions opt)
    {
        var keyBytes = Encoding.UTF8.GetBytes(_jwtKey);

        opt.Events = new JwtBearerEvents
        {
            /* ใช้ access_token ผ่าน WebSocket (SignalR) */
            OnMessageReceived = ctx =>
            {
                var accessToken = ctx.Request.Query["access_token"];
                var path = ctx.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/jobs"))
                    ctx.Token = accessToken;
                return Task.CompletedTask;
            }
        };

        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(keyBytes),
            ValidIssuer = _jwtIssuer,
            ValidAudience = _jwtAudience
        };
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
        var payload = JsonSerializer.Serialize(new
        {
            status = rpt.Status.ToString(),
            checks = rpt.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
                descr = e.Value.Description
            })
        });
        ctx.Response.ContentType = "application/json";
        return ctx.Response.WriteAsync(payload);
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
        app.UseSwaggerUI();
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

                var isValid = ldap.ValidateUser(login.username, login.password);
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
                    "SELECT * FROM FgL.LabelTemplateComponent WHERE TemplateID = @TemplateID ORDER BY ComponentID",
                    new { tpl.TemplateID });
                
                // Create a new instance with components
                var updatedTemplate = tpl with { Components = components.ToList() };
                result.Add(updatedTemplate);
            }
            return Results.Ok(result);
        });

        /* ---------- 4.8  POST /api/templates ------------------------------- */
        app.MapPost("/api/templates", async ([FromBody] SharedModels.CreateTemplateRequest request, [FromServices] ITemplateService templateService) =>
        {
            try
            {
                var templateId = await templateService.SaveTemplateAsync(request);
                return Results.Ok(new { TemplateID = templateId });
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });

        /* ---------- 4.9  PUT /api/templates/{id} -------------------------- */
        app.MapPut("/api/templates/{id}", async ([FromRoute] int id, [FromBody] TemplateRequest request, [FromServices] ISqlConnectionFactory connectionFactory, ILogger<Program> logger) =>
        {
            try
            {
                using var connection = connectionFactory.GetConnection();
                connection.Open();

                // ตรวจสอบว่า template นี้มีอยู่จริงหรือไม่
                var existingTemplate = await connection.QueryFirstOrDefaultAsync<LabelTemplateDto>(@"
                    SELECT * FROM FgL.LabelTemplates WHERE TemplateID = @Id", new { Id = id });

                if (existingTemplate == null)
                {
                    logger.LogWarning($"Template ID {id} not found for update");
                    return Results.NotFound($"Template ID {id} not found");
                }

                logger.LogInformation($"Updating template ID: {id}");

                decimal newVersion = existingTemplate.Version;
                // เพิ่มเวอร์ชันถ้ามีการระบุว่าต้องการเพิ่ม
                if (request.IncrementVersion == true)
                {
                    // เพิ่มเวอร์ชันขึ้น 0.01
                    newVersion = Math.Round(existingTemplate.Version + 0.01m, 2);
                    logger.LogInformation($"Incrementing template version from {existingTemplate.Version} to {newVersion}");
                }

                using var transaction = connection.BeginTransaction();

                try
                {
                    // อัพเดต template
                    await connection.ExecuteAsync(@"
                        UPDATE FgL.LabelTemplates 
                        SET Name = @Name, 
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
                        WHERE TemplateID = @Id", 
                        new { 
                            Id = id,
                            Name = request.Name,
                            Description = request.Description,
                            Engine = "html", // คงที่สำหรับตอนนี้
                            PaperSize = request.PaperSize ?? "A6",
                            Orientation = request.Orientation ?? "Portrait",
                            Content = request.Content,
                            ProductKey = request.ProductKey,
                            CustomerKey = request.CustomerKey,
                            Version = newVersion
                        }, transaction);

                    // ลบ components เก่าออกทั้งหมด
                    await connection.ExecuteAsync(@"
                        DELETE FROM FgL.TemplateComponents WHERE TemplateID = @Id", 
                        new { Id = id }, transaction);

                    // เพิ่ม components ใหม่
                    if (request.Components != null && request.Components.Any())
                    {
                        foreach (var comp in request.Components)
                        {
                            await connection.ExecuteAsync(@"
                                INSERT INTO FgL.TemplateComponents 
                                (TemplateID, ComponentType, X, Y, W, H, FontName, FontSize, Placeholder, StaticText, BarcodeFormat)
                                VALUES (@TemplateId, @ComponentType, @X, @Y, @W, @H, @FontName, @FontSize, @Placeholder, @StaticText, @BarcodeFormat)",
                                new
                                {
                                    TemplateId = id,
                                    ComponentType = comp.Type,
                                    X = comp.X,
                                    Y = comp.Y,
                                    W = comp.Width,
                                    H = comp.Height,
                                    FontName = GetValueByType<string>(comp.Content, "fontFamily"),
                                    FontSize = GetValueByType<int?>(comp.Content, "fontSize"),
                                    Placeholder = GetValueByType<string>(comp.Content, "placeholder"),
                                    StaticText = GetValueByType<string>(comp.Content, "text"),
                                    BarcodeFormat = GetValueByType<string>(comp.Content, "format")
                                }, transaction);
                        }
                    }

                    transaction.Commit();

                    // อัพเดตหรือเพิ่ม mapping ระหว่าง product-customer กับ template
                    await UpdateTemplateMapping(connection, request.ProductKey, request.CustomerKey, id);

                    logger.LogInformation($"Template ID {id} updated successfully");
                    return Results.Ok(new { id, message = "Template updated successfully", version = newVersion });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    logger.LogError(ex, $"Error updating template ID {id}: {ex.Message}");
                    return Results.BadRequest(new { error = ex.Message });
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, $"Error updating template: {ex.Message}");
                return Results.StatusCode(500);
            }
        });

        /* ---------- 4.10  POST /api/templates/{id}/map -------------------- */
        app.MapPost("/api/templates/{id}/map", async (int id, [FromBody] SharedModels.LabelTemplateMapping mapping, [FromServices] IDbConnection db) =>
        {
            await db.ExecuteAsync(@"
                INSERT INTO FgL.LabelTemplateMapping
                    (TemplateID, ProductKey, CustomerKey, Priority, Active, CreatedAt)
                VALUES
                    (@TemplateID, @ProductKey, @CustomerKey, @Priority, @Active, SYSUTCDATETIME())",
                new
                {
                    TemplateID = id,
                    mapping.ProductKey,
                    mapping.CustomerKey,
                    mapping.Priority,
                    mapping.Active
                });
            return Results.Ok();
        });

        /* ---------- 4.10.1  DELETE /api/templates/{id} -------------------- */
        app.MapDelete("/api/templates/{id}", async (int id, [FromServices] ISqlConnectionFactory connectionFactory, [FromServices] ILogger<Program> logger) =>
        {
            using var connection = connectionFactory.GetConnection();
            connection.Open();
            using var tran = connection.BeginTransaction();
            try
            {
                logger.LogInformation("Deleting template ID: {TemplateId}", id);
                
                // ตรวจสอบว่าเทมเพลตมีอยู่จริง
                var existingTemplate = await connection.QueryFirstOrDefaultAsync<SharedModels.LabelTemplate>(
                    "SELECT TemplateID FROM FgL.LabelTemplate WHERE TemplateID = @Id", 
                    new { Id = id },
                    tran);
                    
                if (existingTemplate == null)
                {
                    logger.LogWarning("Template ID {TemplateId} not found", id);
                    return Results.NotFound(new { message = $"Template with ID {id} not found" });
                }

                try {
                    // ตรวจสอบว่ามีการใช้งานเทมเพลตในส่วนอื่นหรือไม่
                    var usageCount = await connection.ExecuteScalarAsync<int>(
                        "SELECT COUNT(*) FROM FgL.LabelPrintJob WHERE TemplateID = @TemplateID", 
                        new { TemplateID = id }, tran);
                        
                    if (usageCount > 0)
                    {
                        logger.LogWarning("Template ID {TemplateId} is in use by {UsageCount} print jobs, marking as inactive instead", id, usageCount);
                        
                        // แทนที่จะลบ ให้เปลี่ยนเป็น inactive
                        await connection.ExecuteAsync(
                            "UPDATE FgL.LabelTemplate SET Active = 0, UpdatedAt = SYSUTCDATETIME() WHERE TemplateID = @TemplateID", 
                            new { TemplateID = id }, tran);
                            
                        tran.Commit();
                        logger.LogInformation("Template ID {TemplateId} marked as inactive", id);
                        return Results.Ok(new { deleted = false, inactive = true, message = "Template marked as inactive" });
                    }
                
                    // ลบ mapping ก่อน (เนื่องจากมี foreign key constraint)
                    logger.LogInformation("Deleting template mappings for ID: {TemplateId}", id);
                    await connection.ExecuteAsync("DELETE FROM FgL.LabelTemplateMapping WHERE TemplateID = @TemplateID", 
                        new { TemplateID = id }, tran);
                    
                    // ลบ components
                    logger.LogInformation("Deleting template components for ID: {TemplateId}", id);
                    await connection.ExecuteAsync("DELETE FROM FgL.LabelTemplateComponent WHERE TemplateID = @TemplateID", 
                        new { TemplateID = id }, tran);
                    
                    // ลบ template
                    logger.LogInformation("Deleting template record for ID: {TemplateId}", id);
                    var rowsAffected = await connection.ExecuteAsync("DELETE FROM FgL.LabelTemplate WHERE TemplateID = @TemplateID", 
                        new { TemplateID = id }, tran);
                    
                    tran.Commit();
                    logger.LogInformation("Template ID {TemplateId} deleted successfully", id);
                    return Results.Ok(new { deleted = true, message = "Template deleted successfully" });
                }
                catch (SqlException sqlEx)
                {
                    logger.LogError(sqlEx, "SQL error deleting template ID {TemplateId}: {Message}", id, sqlEx.Message);
                    
                    // ตรวจสอบว่าเป็น foreign key constraint violation หรือไม่
                    if (sqlEx.Number == 547) // Foreign key constraint violation
                    {
                        logger.LogWarning("Foreign key constraint violation when deleting template ID {TemplateId}, marking as inactive instead", id);
                        
                        // แทนที่จะลบ ให้เปลี่ยนเป็น inactive
                        await connection.ExecuteAsync(
                            "UPDATE FgL.LabelTemplate SET Active = 0, UpdatedAt = SYSUTCDATETIME() WHERE TemplateID = @TemplateID", 
                            new { TemplateID = id }, tran);
                            
                        tran.Commit();
                        return Results.Ok(new { deleted = false, inactive = true, message = "Template marked as inactive due to foreign key constraints" });
                    }
                    
                    throw; // Re-throw ถ้าไม่ใช่ foreign key constraint violation
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error deleting template ID {TemplateId}: {Message}", id, ex.Message);
                try { tran.Rollback(); } catch { /* ignore rollback errors */ }
                
                return Results.Problem(
                    title: "Error deleting template",
                    detail: ex.Message,
                    statusCode: 500
                );
            }
        }).RequireAuthorization();

        /* ---------- 4.11  POST /api/print --------------------------------- */
        app.MapPost("/api/print", async ([FromBody] PrintJobRequest req, [FromServices] IDbConnection db) =>
        {
            var jobId = await db.ExecuteScalarAsync<long>(@"
                INSERT INTO FgL.LabelPrintJob (BatchNo, TemplateID, PrinterID, ProductKey, CustomerKey, Copies, Status, PrintedBy, PrintedAt)
                VALUES (@BatchNo, @TemplateID, @PrinterID, @ProductKey, @CustomerKey, @Copies, 'queued', @PrintedBy, SYSUTCDATETIME());
                SELECT CAST(SCOPE_IDENTITY() as bigint)",
                new
                {
                    req.BatchNo,
                    req.TemplateID,
                    req.PrinterID,
                    req.ProductKey,
                    req.CustomerKey,
                    req.Copies,
                    req.PrintedBy
                });
            return Results.Ok(new { JobID = jobId });
        });

        /* ---------- 4.12  POST /auth/refresh --------------------------------- */
        app.MapPost("/api/auth/refresh", [Authorize] (HttpContext context) =>
        {
            var username = context.User.Identity?.Name;
            if (string.IsNullOrEmpty(username))
            {
                return Results.Unauthorized();
            }

            var token = GenerateJwtToken(username);
            return Results.Ok(new { token, user = new { username } });
        });

        /* ------------------------------------------------------------------ */
        try
        {
            Console.WriteLine("[FgLabel] Before app.RunAsync()");
            await app.RunAsync();
            Console.WriteLine("[FgLabel] After app.RunAsync()");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[FgLabel] API Gateway crashed: {ex}");
            throw;
        }
    }

    // DTO สำหรับ Label Template
    class LabelTemplateDto
    {
        public int TemplateID { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public string Engine { get; set; }
        public string PaperSize { get; set; }
        public string Orientation { get; set; }
        public string Content { get; set; }
        public string ProductKey { get; set; }
        public string CustomerKey { get; set; }
        public decimal Version { get; set; }
        public bool Active { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    // เมธอดสำหรับอัพเดต mapping ระหว่าง product/customer กับ template
    private static async Task UpdateTemplateMapping(IDbConnection connection, string productKey, string customerKey, int templateId)
    {
        if (string.IsNullOrWhiteSpace(productKey) && string.IsNullOrWhiteSpace(customerKey))
        {
            return; // ไม่มีข้อมูลให้ map
        }

        // ตรวจสอบว่ามี mapping อยู่แล้วหรือไม่
        var existingMapping = await connection.QueryFirstOrDefaultAsync<dynamic>(@"
            SELECT * FROM FgL.TemplateMapping 
            WHERE ProductKey = @ProductKey 
              AND CustomerKey = @CustomerKey",
            new { ProductKey = productKey, CustomerKey = customerKey });

        if (existingMapping != null)
        {
            // อัพเดต mapping ที่มีอยู่
            await connection.ExecuteAsync(@"
                UPDATE FgL.TemplateMapping
                SET TemplateID = @TemplateID,
                    UpdatedAt = GETDATE()
                WHERE ProductKey = @ProductKey 
                  AND CustomerKey = @CustomerKey",
                new { 
                    TemplateID = templateId,
                    ProductKey = productKey,
                    CustomerKey = customerKey
                });
        }
        else
        {
            // สร้าง mapping ใหม่
            await connection.ExecuteAsync(@"
                INSERT INTO FgL.TemplateMapping
                (TemplateID, ProductKey, CustomerKey, Priority, Active, CreatedAt)
                VALUES
                (@TemplateID, @ProductKey, @CustomerKey, 1, 1, GETDATE())",
                new { 
                    TemplateID = templateId,
                    ProductKey = productKey,
                    CustomerKey = customerKey
                });
        }
    }

    // Template request model
    public class TemplateRequest
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public string PaperSize { get; set; }
        public string Orientation { get; set; }
        public string Content { get; set; }
        public string ProductKey { get; set; }
        public string CustomerKey { get; set; }
        public List<TemplateComponentRequest> Components { get; set; }
        public bool? IncrementVersion { get; set; }
    }

    public class TemplateComponentRequest
    {
        public string Type { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public int? Width { get; set; }
        public int? Height { get; set; }
        public object Content { get; set; }
    }

    // Helper method to get typed value from JSON object
    private static T GetValueByType<T>(object contentObj, string propertyName)
    {
        if (contentObj == null) return default;
        
        if (contentObj is System.Text.Json.JsonElement jsonElement)
        {
            if (jsonElement.TryGetProperty(propertyName, out var property))
            {
                try
                {
                    if (typeof(T) == typeof(string))
                    {
                        return (T)(object)property.GetString();
                    }
                    else if (typeof(T) == typeof(int) || typeof(T) == typeof(int?))
                    {
                        if (property.TryGetInt32(out var intValue))
                        {
                            return (T)(object)intValue;
                        }
                    }
                }
                catch { }
            }
        }
        
        return default;
    }
}

/* ---------- Request-record ---------------------------------------------- */
public record LoginRequest(string username, string password);
public record JobRequest(string BatchNo, int TemplateId, int Copies);

// ====== PrintJobRequest Model ======
public class PrintJobRequest
{
    public string BatchNo { get; set; } = string.Empty;
    public int? TemplateID { get; set; }
    public int? PrinterID { get; set; }
    public string? ProductKey { get; set; }
    public string? CustomerKey { get; set; }
    public int Copies { get; set; } = 1;
    public string? PrintedBy { get; set; }
}
