# FG Label Printing System - สถาปัตยกรรม

ดูไฟล์ PlantUML (architecture.puml) สำหรับภาพรวมระบบ

- Web UI: Next.js 14, MSAL, GrapesJS, shadcn/ui
- API Gateway: .NET 8 Minimal API, Dapper, SignalR, Redis, RabbitMQ
- Worker: .NET 8 Worker, QuestPDF, SharpZebra, RabbitMQ, SignalR
- Infra: Docker Compose, Redis, RabbitMQ, SQL Server (external)
- Observability: OpenTelemetry → Grafana/Loki 