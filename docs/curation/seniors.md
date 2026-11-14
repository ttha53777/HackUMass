# Evidence: senior programs and ZIP list (fetched 2026-11-14)

Quotes are as returned by WebFetch. The fetch tool summarises pages, so a quote may differ from the live page in small details. Confirm against the live page before release.

## Shared: Highland Valley Elder Services (HVES) service area and contact
- Amherst is in the service area. URL: https://highlandvalley.org/our-services/the-24-towns-in-our-service-area/
  - Heading "The Towns We Serve", followed by a list of 24 towns that starts with "Amherst". Hampshire County and Hampden County are also mentioned.
- Phone and address, shown on every HVES page fetched, e.g. https://highlandvalley.org/services/home-delivered-meals/
  - "(413) 586-2000" ... "320 Riverside Drive, Suite B, Florence, MA 01062"

## hves-home-delivered-meals
URL: https://highlandvalley.org/services/home-delivered-meals/
- Age: "Our Home Care services are available to eligible elders aged 60 and over." (This is about Home Care, so it was not used as a meals threshold.)
- Nutrition goal: "every person over 60 receives at least one nutritionally balanced meal each day"
- Cost: "Meals are free to all who qualify." / "Donations are gratefully accepted."
- Contact: "Call us at (413) 586-2000 to find out more about our Home Delivered Meals and Private Pay Options."
- Hours: "Evening and weekend meals are also available."
- apply_url: https://fd7.formdesk.com/highland/Referral/?get=1&sidn=4b35f8374ab24be48b89a122e3924375
  - The form is titled "Program Referral Form" and has a "Home Delivered Meals" checkbox. Its text refers to "HVES".

## hves-benefits-support
URL: https://highlandvalley.org/services/benefits-support-program/
- "A Benefits Support Specialist can assist individuals in accessing Medicaid, SNAP, Fuel Assistance" (shortened excerpt)
- "To schedule a free consultation with a Certified Application Counselor, please call, (413) 586-2000"
- Eligibility for this service is not stated on the page.

## hves-information-referral
URL: https://highlandvalley.org/services/information-referral/
- "We offer free, friendly conversation about community resources and services available to those age 60 and over, to their caregivers, and to interested individuals." (Over 25 words; the quote that matters is "those age 60 and over, to their caregivers, and to interested individuals.")
- "You can access Transportation Concierge services through the Information & Referral department."
- "Quality long living sometimes means getting a little help in making the right choices for long term care"

## regions.json: ZIP list
- Service metadata: https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/ZIP_Codes_5_Digit_from_HERE/FeatureServer
  - "Geographic boundaries of the United States Postal Service (USPS) five-digit ZIP Code areas within Massachusetts." Copyright: "HERE, MassGIS"
- Fields: https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/ZIP_Codes_5_Digit_from_HERE/FeatureServer/0
  - POSTCODE, PC_NAME, PC_TYPE, PA_NAME, PA_FIPS, CITY_TOWN, COUNTY
- Query for COUNTY='HAMPSHIRE', count {"count":27}: https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/ZIP_Codes_5_Digit_from_HERE/FeatureServer/0/query?where=COUNTY%3D%27HAMPSHIRE%27&outFields=POSTCODE,PC_NAME,PC_TYPE,PA_NAME,CITY_TOWN,COUNTY&returnGeometry=false&orderByFields=POSTCODE&f=json
  - e.g. `"POSTCODE":"01002","PC_NAME":"AMHERST",...,"CITY_TOWN":"AMHERST, TOWN OF","COUNTY":"HAMPSHIRE"`
- Amherst check (query by name or ZIP for 01002, 01003, 01004, 01059): it returned 01002 (Amherst/Hampshire), 01002 (Shutesbury/Franklin) and 01003 (Amherst/Hampshire). 01004 was not returned.

## Not used (fetch failed or not on the provider's own page)
- Amherst Senior Center: every amherstma.gov URL failed with ECONNREFUSED or timed out (WebFetch and curl), so no program file was written.
- mass.gov pages (ASAP list, SHINE directory, Appendix F ZIP list) returned HTTP 403.
- SHINE: https://lifepathma.org/what-we-offer/information-and-consultations/shine/ loaded, but the page does not name Hampshire County or Amherst. Omitted.
