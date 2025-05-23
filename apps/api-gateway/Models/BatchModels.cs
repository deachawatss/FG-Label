using System;
using System.Collections.Generic;

namespace FgLabel.Api.Models
{
    // คลาสสำหรับข้อมูล Batch
    public class BatchDto
    {
        public string? BatchNo { get; set; }
        public string? ProductKey { get; set; }
        public string? CustomerKey { get; set; }
        public string? ProductName { get; set; }
        public string? CustomerName { get; set; }
        public string? BagNo { get; set; }
        public int? TotalBags { get; set; }
        public DateTime? ProductionDate { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public int? TemplateId { get; set; }
        public string? TemplateName { get; set; }
        public DateTime? TemplateUpdatedAt { get; set; }
        public string? SONumber { get; set; }
        public int? ShelfLifeDays { get; set; }
        public int? DaysToExpire { get; set; }
        public DateTime? SchStartDate { get; set; }
        public string? LotCode { get; set; }
        public string? StorageCondition { get; set; }
        public string? ALLERGEN1 { get; set; }
        public string? ALLERGEN2 { get; set; }
        public string? ALLERGEN3 { get; set; }
        public string? ALLERGEN2_BeforeColon { get; set; }
        public string? ALLERGEN2_AfterColon { get; set; }
        public string? ALLERGEN3_BeforeColon { get; set; }
        public string? ALLERGEN3_AfterColon { get; set; }
        public string? PRODATECAP { get; set; }
        public string? EXPIRYDATECAP { get; set; }
        public string? COUNTRYOFORIGIN { get; set; }
        public string? CountryOfOriginLine { get; set; }
        public string? PACKUNIT1 { get; set; }
        public decimal? NET_WEIGHT1 { get; set; }
        public string? ExpiryDateCaption { get; set; }
        public string? ProductionDateCaption { get; set; }
        public string? ThaiFlourOverride { get; set; }
    }

    // คลาสที่สะท้อนโครงสร้างข้อมูลจาก FgL.tvf_Label_PrintData ใหม่
    public class LabelRowDto
    {
        // ข้อมูลหลักของ Batch
        public string? BatchNo { get; set; }
        public DateTime? BatchTicketDate { get; set; }
        public DateTime? SchStartDate { get; set; }
        public DateTime? ProductionDate { get; set; }
        public DateTime? ActCompletionDate { get; set; }
        
        // ข้อมูล Product และ Customer
        public string? ItemKeyResolved { get; set; }
        public string? CustKeyResolved { get; set; }
        public string? CustKey { get; set; }
        public string? ItemKey { get; set; }
        
        // ข้อมูลผลิตภัณฑ์
        public decimal? PACKSIZE1 { get; set; }
        public string? PACKUNIT1 { get; set; }
        public decimal? PACKSIZE2 { get; set; }
        public string? PACKUNIT2 { get; set; }
        public decimal? TOTAL_UNIT2_IN_UNIT1 { get; set; }
        public decimal? NET_WEIGHT1 { get; set; }
        public decimal? GROSS_WEIGHT1 { get; set; }
        
        // ข้อมูล Shelf Life
        public decimal? SHELFLIFE_MONTH { get; set; }
        public decimal? SHELFLIFE_DAY { get; set; }
        public decimal? SHELFLIFE_DAYLIMIT { get; set; }
        
        // ข้อมูลอื่นๆ จาก BME_LABEL
        public string? LABEL_COLOR { get; set; }
        public string? BME_Product { get; set; }
        public string? DESCRIPTION { get; set; }
        public string? LOT_CODE { get; set; }
        public string? BEST_BEFORE { get; set; }
        public string? CUSTITEMCODE { get; set; }
        public string? ALLERGEN1 { get; set; }
        public string? ALLERGEN2 { get; set; }
        public string? ALLERGEN3 { get; set; }
        public string? STORECAP1 { get; set; }
        public string? GMO1 { get; set; }
        public string? PRODATECAP { get; set; }
        public string? EXPIRYDATECAP { get; set; }
        public string? ITEMCAP { get; set; }
        public string? WEIGHCAP { get; set; }
        public string? COUNTRYOFORIGIN { get; set; }
        public string? REMARK1 { get; set; }
        public string? SMALLPACKINFO { get; set; }
        public string? LABEL_INSTRUCTION { get; set; }
        
        // ข้อมูลจาก INMAST และตารางอื่นๆ
        public string? Product { get; set; }
        public int? DaysToExpire { get; set; }
        public string? Customer_Name { get; set; }
        public string? Address_1 { get; set; }
        public string? Address_2 { get; set; }
        public string? Address_3 { get; set; }
        public string? City { get; set; }
        public string? State { get; set; }
        public string? Country { get; set; }
        public string? ShipToCountry { get; set; }
        
        // ข้อมูลน้ำหนัก/จำนวนถุง
        public decimal? TotalWeightKG { get; set; }
        public decimal? BagWKG { get; set; }
        public decimal? CartonWKG { get; set; }
        public int? TotalBags { get; set; }
        public int? TotalCTN { get; set; }
        
        // ข้อมูล Template
        public int? TemplateID { get; set; }
        public string? TemplateName { get; set; }
        public DateTime? TemplateUpdatedAt { get; set; }
        public string? Content { get; set; }
        public string? Engine { get; set; }
        public string? PaperSize { get; set; }
        
        // ข้อมูล Bag (เพิ่มใหม่จาก tvf_Label_PrintData)
        public string? BagNo { get; set; }
        public int? BagSequence { get; set; }
        public string? BagPosition { get; set; }
        public int? BagNumbers_Total { get; set; } // จำนวนถุงทั้งหมด
        
        // ข้อมูล SO
        public string? SONumber { get; set; }
        
        // เพิ่มเติมข้อมูลสำหรับรองรับ LabelRowNo ที่คืนจาก SP
        public int? LabelRowNo { get; set; }
    }

    // คลาสสำหรับ Auto Create Request
    public class AutoCreateRequest
    {
        public string BatchNo { get; set; } = string.Empty;
        public string? ProductKey { get; set; }
        public string? CustomerKey { get; set; }
    }

    // คลาสสำหรับการ Login
    public class LoginRequest
    {
        public string username { get; set; } = string.Empty;
        public string password { get; set; } = string.Empty;
    }

    // คลาสสำหรับการขอ Job
    public class JobRequest
    {
        public string BatchNo { get; set; } = string.Empty;
        public int? TemplateId { get; set; }
        public int Copies { get; set; } = 1;
        public int? PrinterId { get; set; }
        public string? ProductKey { get; set; }
        public string? CustomerKey { get; set; }
        public int? StartBag { get; set; } = 1;
        public int? EndBag { get; set; }
        public bool QcSample { get; set; } = false;
        public bool FormSheet { get; set; } = false;
        public bool PalletTag { get; set; } = false;
        public string? Status { get; set; } = "queued";
        public int? Quantity { get; set; } = 1;
    }
} 