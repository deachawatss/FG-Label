using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.Authentication.JwtBearer;

namespace FgLabel.Api.Utilities
{
    public static class JwtHelper
    {
        public static string GenerateToken(string username, string key, string issuer, string audience)
        {
            var keyBytes = Encoding.UTF8.GetBytes(key);
            var handler = new JwtSecurityTokenHandler();
            var descriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, username) }),
                Expires = DateTime.UtcNow.AddDays(7),
                Issuer = issuer,
                Audience = audience,
                SigningCredentials = new SigningCredentials(
                    new SymmetricSecurityKey(keyBytes),
                    SecurityAlgorithms.HmacSha256Signature)
            };
            return handler.WriteToken(handler.CreateToken(descriptor));
        }

        public static void ConfigureJwt(JwtBearerOptions opt, string key, string issuer, string audience)
        {
            var keyBytes = Encoding.UTF8.GetBytes(key);

            opt.Events = new JwtBearerEvents
            {
                OnMessageReceived = ctx =>
                {
                    var accessToken = ctx.Request.Query["access_token"];
                    var path = ctx.HttpContext.Request.Path;
                    if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/job"))
                    {
                        ctx.Token = accessToken;
                    }
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
                ValidIssuer = issuer,
                ValidAudience = audience
            };
        }
    }
} 