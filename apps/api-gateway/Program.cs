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
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using RabbitMQ.Client;
using Services;
using StackExchange.Redis;
using FgLabel.Api.Services;
using FgLabel.Api.Models;

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

    public static async Task Main(string[] args)
    {
        /* ------------------------------------------------------------------ */
        /* 1) โหลด .env  +  Environment variables                             */
        /* ------------------------------------------------------------------ */
        Env.Load("../../.env");
        var builder = WebApplication.CreateBuilder(args);
        builder.Configuration.AddEnvironmentVariables();

        // Load JWT config values once (use section key)
        var jwtSection = builder.Configuration.GetSection("JWT");
        _jwtKey = jwtSection["Key"] ?? Environment.GetEnvironmentVariable("JWT__Key");
        _jwtIssuer = jwtSection["Issuer"] ?? Environment.GetEnvironmentVariable("JWT__Issuer") ?? "FgLabel";
        _jwtAudience = jwtSection["Audience"] ?? Environment.GetEnvironmentVariable("JWT__Audience") ?? _jwtIssuer;

        if (string.IsNullOrWhiteSpace(_jwtKey))
            throw new InvalidOperationException("JWT Key is missing – set JWT__Key in .env");

        Console.WriteLine($"[JWT] KeyLength={_jwtKey.Length}, Issuer={_jwtIssuer}");

        /* ------------------------------------------------------------------ */
        /* 2) Service & Infrastructure                                        */
        /* ------------------------------------------------------------------ */

        // ----- Swagger ----------------------------------------------------- //
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen(c =>
        {
            c.SwaggerDoc("v1", new() { Title = "FgLabel API", Version = "v1" });
            c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            {
                Description = "JWT in Authorization header. Example: **Bearer {token}**",
                Name = "Authorization",
                In = ParameterLocation.Header,
                Type = SecuritySchemeType.ApiKey
            });
            c.AddSecurityRequirement(new OpenApiSecurityRequirement {
                { new() {
                        Reference = new() {
                            Type = ReferenceType.SecurityScheme,
                            Id   = "Bearer"
                         }
                    }, Array.Empty<string>() }
            });
        });

        // ----- CORS  (ระบุ origin ของ front-end) --------------------------- //
        var frontendUrl = GetOptionalConfig(builder.Configuration, "FRONTEND_URL", "http://localhost:3500") ?? "http://localhost:3500";
        builder.Services.AddCors(options =>
        {
            options.AddPolicy("AllowFrontend", builder =>
            {
                builder.WithOrigins(frontendUrl)
                       .AllowAnyMethod()
                       .AllowAnyHeader()
                       .AllowCredentials();
            });
        });

        // ----- SignalR + Redis back-plane ---------------------------------- //
        var redisConn = GetOptionalConfig(builder.Configuration, "Redis__ConnectionString", "localhost:6379") ?? "localhost:6379";
        try
        {
            builder.Services.AddSignalR()
                            .AddStackExchangeRedis(redisConn.Split(',')[0]);
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
        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                        .AddJwtBearer(ConfigureJwt);
        builder.Services.AddAuthorization();

        // ----- SQL Connection String  ------------------------------------- //
        string sqlConn = builder.Configuration.GetConnectionString("DefaultConnection") ?? "";

        // ----- Health-checks ---------------------------------------------- //
        try
        {
            builder.Services.AddHealthChecks()
                            .AddRedis(redisConn, "redis")
                            .AddRabbitMQ()
                            .AddSqlServer(sqlConn ?? "");
        }
        catch (Exception ex)
        {
            Console.WriteLine("[FgLabel] HealthChecks setup failed: " + ex.Message);
        }

        // ----- LDAP service  ---------------------------------------------- //
        try
        {
            builder.Services.AddScoped<LdapService>();
            builder.Services.Configure<LdapConfig>(options =>
            {
                options.Url = GetOptionalConfig(builder.Configuration, "AD__Url", "ldap://192.168.0.1") ?? "ldap://192.168.0.1";
                options.BaseDn = GetOptionalConfig(builder.Configuration, "AD__BaseDn", "OU=Thailand,DC=NWFTH,DC=com") ?? "OU=Thailand,DC=NWFTH,DC=com";
                options.Username = GetOptionalConfig(builder.Configuration, "AD__Username", "deachawat@newlywedsfoods.co.th") ?? "deachawat@newlywedsfoods.co.th";
                options.Password = GetOptionalConfig(builder.Configuration, "AD__Password", "Nwfth.c0m2026") ?? "Nwfth.c0m2026";
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine("[FgLabel] LDAP setup failed: " + ex.Message);
        }

        // ----- Batch & Template services  --------------------------------- //
        builder.Services.AddScoped<IBatchService, BatchService>();
        builder.Services.AddScoped<ITemplateService, TemplateService>();

        // ----- OpenTelemetry (optional console exporter) ------------------- //
        try
        {
            builder.Services.AddOpenTelemetry()
                   .WithTracing(b => b
                       .AddAspNetCoreInstrumentation()
                       .AddSqlClientInstrumentation()
                       .AddSource("FgLabel.Api")
                       .SetResourceBuilder(ResourceBuilder.CreateDefault()
                           .AddService("FgLabel.Api"))
                       .AddConsoleExporter());
        }
        catch (Exception ex)
        {
            Console.WriteLine("[FgLabel] OpenTelemetry setup failed: " + ex.Message);
        }

        /* ------------------------------------------------------------------ */
        Console.WriteLine("[FgLabel] Before builder.Build()");
        var app = builder.Build();
        Console.WriteLine("[FgLabel] After builder.Build()");
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
        app.MapPost("/api/auth/login", (LoginRequest login, LdapService ldap) =>
        {
            // Mask password in logs
            log.LogInformation("/api/auth/login username: {Username}", login.username);

            if (!ldap.ValidateUser(login.username, login.password))
                return Results.Unauthorized();

            var user = new { id = login.username, username = login.username, role = "user" };
            var token = GenerateJwtToken(login.username);
            return Results.Ok(new { token, user });
        });

        /* ---------- 4.2  GET /api/batches/current ------------------------- */
        app.MapGet("/api/batches/current", async (
                   IBatchService batchService) =>
        {
            var batches = await batchService.GetCurrentBatchesAsync();
            return Results.Ok(batches);
        }).RequireAuthorization();

        /* ---------- 4.3  POST /api/templates/auto-create ------------------- */
        app.MapPost("/api/templates/auto-create", async (
                   AutoCreateRequest request,
                   ITemplateService templateService) =>
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
}

/* ---------- Request-record ---------------------------------------------- */
public record LoginRequest(string username, string password);
public record JobRequest(string BatchNo, int TemplateId, int Copies);
