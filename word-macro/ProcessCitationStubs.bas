Attribute VB_Name = "ZoteroCiteStubs"
'================================================================
' ProcessCitationStubs — Word VBA Macro
'
' Scans the active document for {{CITE:...}} and {{BIBLIOGRAPHY}}
' stubs, fetches item data from the Zotero local API, and inserts
' live Zotero field codes that the Zotero Word plugin recognizes.
'
' After running this macro, click Zotero > Refresh in Word.
'
' REQUIREMENTS:
'   - Zotero desktop must be running (local API on port 23119)
'   - The Zotero Word plugin must be installed
'================================================================

Option Explicit

' Zotero local API base URLs
Private Const ZOTERO_API_USER As String = "http://localhost:23119/api/users/0"
Private Const ZOTERO_API_GROUP_PREFIX As String = "http://localhost:23119/api/groups/"
Private Const DEFAULT_STYLE_URL As String = "http://www.zotero.org/styles/apa"

' Cached user ID (fetched once per run)
Private m_userId As String
Private m_documentStyleUrl As String

'----------------------------------------------------------------
' Main entry point
'----------------------------------------------------------------
Public Sub ProcessCitationStubs()
    On Error GoTo ErrHandler

    Application.ScreenUpdating = False

    m_userId = GetZoteroUserId()
    m_documentStyleUrl = ""

    ProcessBibliographyStubs

    Dim count As Long
    count = ProcessCiteStubs()

    SetZoteroPreferences

    Application.ScreenUpdating = True
    MsgBox count & " citation(s) converted to Zotero field codes." & vbCrLf & vbCrLf & _
           "Click Zotero > Refresh to format them.", vbInformation
    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    MsgBox "Error: " & Err.Description, vbCritical
End Sub

'----------------------------------------------------------------
' Get the numeric Zotero user ID from an item's library field
'----------------------------------------------------------------
Private Function GetZoteroUserId() As String
    Dim json As String
    json = HttpGet(ZOTERO_API_USER & "/items?format=json&limit=1")
    If json = "" Then
        GetZoteroUserId = ""
        Exit Function
    End If

    Dim pos As Long
    pos = InStr(json, """library""")
    If pos = 0 Then GetZoteroUserId = "": Exit Function

    pos = InStr(pos, json, """id"":")
    If pos = 0 Then GetZoteroUserId = "": Exit Function

    Dim numStart As Long
    numStart = pos + 5
    Dim numEnd As Long
    numEnd = numStart
    Do While numEnd <= Len(json) And IsNumeric(Mid(json, numEnd, 1))
        numEnd = numEnd + 1
    Loop

    GetZoteroUserId = Mid(json, numStart, numEnd - numStart)
End Function

'----------------------------------------------------------------
' Process all {{CITE:...}} stubs
'----------------------------------------------------------------
Private Function ProcessCiteStubs() As Long
    Dim rng As Range
    Dim count As Long
    count = 0

    Do
        Set rng = ActiveDocument.Content
        With rng.Find
            .ClearFormatting
            .Text = "\{\{CITE:*\}\}"
            .MatchWildcards = True
            .Forward = True
            .Wrap = wdFindStop
            If Not .Execute Then Exit Do
        End With

        Dim stubText As String
        stubText = rng.Text
        stubText = Mid(stubText, 3, Len(stubText) - 4) ' remove {{ and }}
        stubText = Mid(stubText, 6) ' remove CITE:

        Dim parts() As String
        parts = Split(stubText, "|")

        Dim keysStr As String
        keysStr = parts(0)

        Dim locator As String: locator = ""
        Dim prefix As String: prefix = ""
        Dim suffix As String: suffix = ""
        Dim suppressAuthor As Boolean: suppressAuthor = False
        Dim librarySpec As String: librarySpec = ""

        Dim i As Long
        For i = 1 To UBound(parts)
            Dim opt As String
            opt = Trim(parts(i))
            If Left(opt, 2) = "p=" Then
                locator = UrlDecode(Mid(opt, 3))
            ElseIf Left(opt, 7) = "prefix=" Then
                prefix = UrlDecode(Mid(opt, 8))
            ElseIf Left(opt, 7) = "suffix=" Then
                suffix = UrlDecode(Mid(opt, 8))
            ElseIf Left(opt, 4) = "lib=" Then
                librarySpec = UrlDecode(Mid(opt, 5))
            ElseIf opt = "suppress-author" Then
                suppressAuthor = True
            End If
        Next i

        Dim keys() As String
        keys = Split(keysStr, ";")

        ' Build the field code JSON and display text
        Dim fieldCode As String
        Dim displayText As String
        fieldCode = BuildCitationFieldCode(keys, locator, prefix, suffix, suppressAuthor, librarySpec, displayText)

        If fieldCode <> "" Then
            ' Insert as OOXML with proper 5-part structure
            InsertZoteroField rng, fieldCode, displayText
            count = count + 1
        Else
            rng.Collapse wdCollapseEnd
        End If
    Loop

    ProcessCiteStubs = count
End Function

'----------------------------------------------------------------
' Insert a Zotero field code.
'
' Uses Fields.Add which creates a compact single instrText element.
' Do NOT overwrite Field.Code.Text afterward — that causes Word to
' re-fragment the JSON across hundreds of runs.
'
' Note: Fields.Add for ADDIN fields does not create a separate
' element or result/display text. Zotero's Refresh will add these
' on first run. The "dontUpdate" property in the JSON tells Zotero
' to preserve our display text hint in formattedCitation.
'----------------------------------------------------------------
Private Sub InsertZoteroField(rng As Range, instrText As String, displayText As String)
    Dim fld As Field
    Set fld = ActiveDocument.Fields.Add( _
        Range:=rng, _
        Type:=wdFieldEmpty, _
        Text:=instrText, _
        PreserveFormatting:=False)
End Sub

'----------------------------------------------------------------
' Build ADDIN ZOTERO_ITEM CSL_CITATION JSON for one citation
' Also sets displayText (ByRef) for the visible part of the field
'----------------------------------------------------------------
Private Function BuildCitationFieldCode( _
    keys() As String, _
    locator As String, _
    prefix As String, _
    suffix As String, _
    suppressAuthor As Boolean, _
    librarySpec As String, _
    ByRef displayText As String _
) As String

    Dim citId As String
    citId = GenerateCitationId()

    Dim citItems As String: citItems = ""
    Dim displayParts As String: displayParts = ""

    Dim normalizedLibrarySpec As String
    normalizedLibrarySpec = NormalizeLibrarySpec(librarySpec)
    If normalizedLibrarySpec = "" Then
        BuildCitationFieldCode = ""
        Exit Function
    End If

    Dim i As Long
    For i = 0 To UBound(keys)
        Dim key As String
        key = Trim(keys(i))

        Dim itemJson As String
        itemJson = HttpGet(ApiBaseForLibrarySpec(normalizedLibrarySpec) & "/items/" & key & "?format=json&include=data,csljson")
        If itemJson = "" Then
            BuildCitationFieldCode = ""
            Exit Function
        End If

        Dim cslJson As String
        cslJson = ExtractCslJson(itemJson)

        Dim numId As Long
        numId = KeyToNumericId(key)

        Dim uri As String
        uri = ZoteroUriForLibrarySpec(normalizedLibrarySpec, key)

        Dim display As String
        display = ExtractDisplayText(cslJson)

        ' Fix itemData: numeric id and numeric date-parts
        cslJson = FixItemDataId(cslJson, numId)
        cslJson = FixDateParts(cslJson)

        ' Build citation item JSON (compact, single line)
        Dim citItem As String
        citItem = "{""id"":" & numId & ",""uris"":[""" & uri & """],""itemData"":" & cslJson

        If locator <> "" Then citItem = citItem & ",""locator"":""" & JsonEscape(locator) & """"
        If prefix <> "" Then citItem = citItem & ",""prefix"":""" & JsonEscape(prefix) & """"
        If suffix <> "" Then citItem = citItem & ",""suffix"":""" & JsonEscape(suffix) & """"
        If suppressAuthor Then citItem = citItem & ",""suppress-author"":true"

        citItem = citItem & "}"

        If citItems <> "" Then citItems = citItems & ","
        citItems = citItems & citItem

        If displayParts <> "" Then displayParts = displayParts & "; "
        displayParts = displayParts & Mid(display, 2, Len(display) - 2)
    Next i

    Dim fullDisplay As String
    fullDisplay = "(" & displayParts & ")"
    displayText = fullDisplay

    ' Build the complete CSL_CITATION JSON (compact, single line)
    Dim citation As String
    citation = "{""citationID"":""" & citId & """"
    citation = citation & ",""properties"":{""formattedCitation"":""" & JsonEscape(fullDisplay) & """,""plainCitation"":""" & JsonEscape(fullDisplay) & """,""dontUpdate"":true,""noteIndex"":0}"
    citation = citation & ",""citationItems"":[" & citItems & "]"
    citation = citation & ",""schema"":""https://github.com/citation-style-language/schema/raw/master/csl-citation.json""}"

    BuildCitationFieldCode = "ADDIN ZOTERO_ITEM CSL_CITATION " & citation
End Function

'----------------------------------------------------------------
' Process {{BIBLIOGRAPHY}} stubs
'----------------------------------------------------------------
Private Sub ProcessBibliographyStubs()
    Dim rng As Range

    Do
        Set rng = ActiveDocument.Content
        With rng.Find
            .ClearFormatting
            .Text = "\{\{BIBLIOGRAPHY*\}\}"
            .MatchWildcards = True
            .Forward = True
            .Wrap = wdFindStop
            If Not .Execute Then Exit Do
        End With

        Dim stubText As String
        stubText = rng.Text
        stubText = Mid(stubText, 3, Len(stubText) - 4) ' remove {{ and }}
        If Len(stubText) > 12 Then
            stubText = Mid(stubText, 13) ' remove BIBLIOGRAPHY
        Else
            stubText = ""
        End If

        If Len(stubText) > 0 Then
            Dim parts() As String
            parts = Split(stubText, "|")

            Dim i As Long
            For i = 0 To UBound(parts)
                Dim opt As String
                opt = Trim(parts(i))
                If Left(opt, 6) = "style=" Then
                    Dim styleUrl As String
                    styleUrl = StyleNameToUrl(UrlDecode(Mid(opt, 7)))
                    If styleUrl <> "" Then
                        m_documentStyleUrl = styleUrl
                    End If
                End If
            Next i
        End If

        ' Insert bibliography field via OOXML
        Dim instrText As String
        instrText = "ADDIN ZOTERO_BIBL {""uncited"":[],""omitted"":[],""custom"":[]} CSL_BIBLIOGRAPHY"
        InsertZoteroField rng, instrText, "[Bibliography — click Zotero > Refresh]"
    Loop
End Sub

'----------------------------------------------------------------
' Set Zotero document preferences via custom document property
'----------------------------------------------------------------
Private Sub SetZoteroPreferences()
    Dim styleUrl As String
    styleUrl = m_documentStyleUrl
    If styleUrl = "" Then styleUrl = DEFAULT_STYLE_URL

    Dim prefData As String
    prefData = "<data data-version=""3"" zotero-version=""7.0.0"">" & _
               "<session id=""" & GenerateCitationId() & """/>" & _
               "<style id=""" & styleUrl & """ locale=""en-US"" hasBibliography=""1"" bibliographyStyleHasBeenSet=""0""/>" & _
               "<prefs>" & _
               "<pref name=""fieldType"" value=""Field""/>" & _
               "<pref name=""automaticJournalAbbreviations"" value=""true""/>" & _
               "</prefs>" & _
               "</data>"

    On Error Resume Next
    ActiveDocument.CustomDocumentProperties("ZOTERO_PREF_1").Delete
    On Error GoTo 0

    ActiveDocument.CustomDocumentProperties.Add _
        Name:="ZOTERO_PREF_1", _
        LinkToContent:=False, _
        Type:=msoPropertyTypeString, _
        Value:=prefData
End Sub

'----------------------------------------------------------------
' HTTP GET
'----------------------------------------------------------------
Private Function HttpGet(url As String) As String
    On Error GoTo ErrHandler
    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "GET", url, False
    http.setRequestHeader "Content-Type", "application/json"
    http.Send
    If http.Status = 200 Then
        HttpGet = http.responseText
    Else
        HttpGet = ""
    End If
    Exit Function
ErrHandler:
    HttpGet = ""
End Function

'----------------------------------------------------------------
' Library context helpers
'----------------------------------------------------------------
Private Function NormalizeLibrarySpec(librarySpec As String) As String
    If librarySpec <> "" Then
        NormalizeLibrarySpec = librarySpec
    ElseIf m_userId <> "" Then
        NormalizeLibrarySpec = "user:" & m_userId
    Else
        NormalizeLibrarySpec = ""
    End If
End Function

Private Function ApiBaseForLibrarySpec(librarySpec As String) As String
    If Left$(librarySpec, 6) = "group:" Then
        ApiBaseForLibrarySpec = ZOTERO_API_GROUP_PREFIX & Mid$(librarySpec, 7)
    Else
        ApiBaseForLibrarySpec = ZOTERO_API_USER
    End If
End Function

Private Function ZoteroUriForLibrarySpec(librarySpec As String, key As String) As String
    If Left$(librarySpec, 6) = "group:" Then
        ZoteroUriForLibrarySpec = "http://zotero.org/groups/" & Mid$(librarySpec, 7) & "/items/" & key
    Else
        ZoteroUriForLibrarySpec = "http://zotero.org/users/" & Mid$(librarySpec, 6) & "/items/" & key
    End If
End Function

Private Function StyleNameToUrl(styleName As String) As String
    Select Case LCase$(styleName)
        Case "apa": StyleNameToUrl = "http://www.zotero.org/styles/apa"
        Case "chicago-author-date": StyleNameToUrl = "http://www.zotero.org/styles/chicago-author-date"
        Case "mla": StyleNameToUrl = "http://www.zotero.org/styles/modern-language-association"
        Case "ieee": StyleNameToUrl = "http://www.zotero.org/styles/ieee"
        Case "harvard": StyleNameToUrl = "http://www.zotero.org/styles/harvard-cite-them-right"
        Case Else: StyleNameToUrl = ""
    End Select
End Function

'----------------------------------------------------------------
' CSL-JSON extraction and fixing
'----------------------------------------------------------------
Private Function ExtractCslJson(itemJson As String) As String
    Dim pos As Long
    pos = InStr(itemJson, """csljson"":")
    If pos = 0 Then ExtractCslJson = "{}": Exit Function

    Dim valStart As Long
    valStart = InStr(pos, itemJson, ":") + 1

    Do While Mid(itemJson, valStart, 1) = " " Or Mid(itemJson, valStart, 1) = vbTab
        valStart = valStart + 1
    Loop

    Dim firstChar As String
    firstChar = Mid(itemJson, valStart, 1)

    If firstChar = """" Then
        Dim strVal As String
        strVal = ExtractJsonString(itemJson, valStart)
        If Left(Trim(strVal), 1) = "[" Then
            ExtractCslJson = ExtractFirstJsonObject(strVal)
        Else
            ExtractCslJson = strVal
        End If
    ElseIf firstChar = "[" Then
        ExtractCslJson = ExtractFirstJsonObject(Mid(itemJson, valStart))
    Else
        ExtractCslJson = "{}"
    End If
End Function

Private Function ExtractFirstJsonObject(jsonArray As String) As String
    Dim objStart As Long
    objStart = InStr(jsonArray, "{")
    If objStart = 0 Then
        ExtractFirstJsonObject = "{}"
        Exit Function
    End If

    Dim depth As Long: depth = 0
    Dim i As Long
    For i = objStart To Len(jsonArray)
        Dim c As String: c = Mid(jsonArray, i, 1)
        If c = "{" Then depth = depth + 1
        If c = "}" Then
            depth = depth - 1
            If depth = 0 Then
                ExtractFirstJsonObject = Mid(jsonArray, objStart, i - objStart + 1)
                Exit Function
            End If
        End If
    Next i
    ExtractFirstJsonObject = "{}"
End Function

Private Function ExtractJsonString(json As String, startPos As Long) As String
    Dim result As String: result = ""
    Dim p As Long: p = startPos + 1
    Dim escaped As Boolean: escaped = False

    Do While p <= Len(json)
        Dim c As String: c = Mid(json, p, 1)
        If escaped Then
            Select Case c
                Case """": result = result & """"
                Case "\": result = result & "\"
                Case "/": result = result & "/"
                Case "n": result = result & vbLf
                Case "r": result = result & vbCr
                Case "t": result = result & vbTab
                Case Else: result = result & c
            End Select
            escaped = False
        ElseIf c = "\" Then
            escaped = True
        ElseIf c = """" Then
            Exit Do
        Else
            result = result & c
        End If
        p = p + 1
    Loop
    ExtractJsonString = result
End Function

'----------------------------------------------------------------
' Fix itemData.id: replace string id with numeric
'----------------------------------------------------------------
Private Function FixItemDataId(cslJson As String, numId As Long) As String
    Dim pos As Long
    pos = InStr(cslJson, """id"":")
    If pos = 0 Then FixItemDataId = cslJson: Exit Function

    Dim afterColon As Long
    afterColon = InStr(pos, cslJson, ":") + 1
    Do While Mid(cslJson, afterColon, 1) = " "
        afterColon = afterColon + 1
    Loop

    If Mid(cslJson, afterColon, 1) = """" Then
        Dim closeQuote As Long
        closeQuote = InStr(afterColon + 1, cslJson, """")
        FixItemDataId = Left(cslJson, afterColon - 1) & CStr(numId) & Mid(cslJson, closeQuote + 1)
    Else
        FixItemDataId = cslJson
    End If
End Function

'----------------------------------------------------------------
' Fix date-parts: convert string years to numbers
' [["2025"]] → [[2025]], [["2025","3","15"]] → [[2025,3,15]]
'----------------------------------------------------------------
Private Function FixDateParts(cslJson As String) As String
    ' Replace quoted numbers inside date-parts arrays:
    '   [["2025"]] → [[2025]]
    '   [["2025","3","15"]] → [[2025,3,15]]
    '
    ' Uses RegExp to find all "NNNN" patterns within the date-parts
    ' region and strip the quotes.
    Dim result As String: result = cslJson

    Dim re As Object
    Set re = CreateObject("VBScript.RegExp")
    re.Global = True
    ' Match a quoted number: "digits"
    re.Pattern = """(\d+)"""

    Dim dpPos As Long
    dpPos = InStr(result, """date-parts""")

    Do While dpPos > 0
        Dim arrStart As Long
        arrStart = InStr(dpPos, result, "[[")
        If arrStart = 0 Then Exit Do

        Dim arrEnd As Long
        arrEnd = InStr(arrStart, result, "]]")
        If arrEnd = 0 Then Exit Do

        ' Extract the inner array content between [[ and ]]
        Dim dateRegion As String
        dateRegion = Mid(result, arrStart, arrEnd - arrStart + 2)

        ' Replace "NNNN" with NNNN (strip quotes from numbers)
        Dim fixedRegion As String
        fixedRegion = re.Replace(dateRegion, "$1")

        result = Left(result, arrStart - 1) & fixedRegion & Mid(result, arrEnd + 2)

        dpPos = InStr(arrStart + Len(fixedRegion), result, """date-parts""")
    Loop

    FixDateParts = result
End Function

'----------------------------------------------------------------
' Extract display text from CSL-JSON
'----------------------------------------------------------------
Private Function ExtractDisplayText(cslJson As String) As String
    Dim author As String: author = "Unknown"
    Dim year As String: year = "n.d."

    Dim famPos As Long
    famPos = InStr(cslJson, """family"":")
    If famPos > 0 Then
        Dim famStart As Long
        famStart = InStr(famPos + 9, cslJson, """") + 1
        Dim famEnd As Long
        famEnd = InStr(famStart, cslJson, """")
        If famEnd > famStart Then
            author = Mid(cslJson, famStart, famEnd - famStart)
        End If
    End If

    Dim dpPos As Long
    dpPos = InStr(cslJson, """date-parts""")
    If dpPos > 0 Then
        Dim numPos As Long
        numPos = InStr(dpPos, cslJson, "[[")
        If numPos > 0 Then
            numPos = numPos + 2
            ' Skip quote if present
            If Mid(cslJson, numPos, 1) = """" Then numPos = numPos + 1
            Dim yearEnd As Long: yearEnd = numPos
            Do While yearEnd <= Len(cslJson) And IsNumeric(Mid(cslJson, yearEnd, 1))
                yearEnd = yearEnd + 1
            Loop
            If yearEnd > numPos Then
                year = Mid(cslJson, numPos, yearEnd - numPos)
            End If
        End If
    End If

    ExtractDisplayText = "(" & author & ", " & year & ")"
End Function

'----------------------------------------------------------------
' Generate 8-char random alphanumeric string
'----------------------------------------------------------------
Private Function GenerateCitationId() As String
    Dim chars As String
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    Dim result As String: result = ""
    Dim i As Long
    Randomize
    For i = 1 To 8
        result = result & Mid(chars, Int(Rnd() * Len(chars)) + 1, 1)
    Next i
    GenerateCitationId = result
End Function

'----------------------------------------------------------------
' Convert item key to deterministic numeric ID
'----------------------------------------------------------------
Private Function KeyToNumericId(key As String) As Long
    Dim hash As Double: hash = 0
    Dim i As Long
    For i = 1 To Len(key)
        hash = hash * 31 + Asc(Mid(key, i, 1))
    Next i
    hash = hash - Int(hash / 2147483647#) * 2147483647#
    KeyToNumericId = CLng(Abs(hash))
End Function

'----------------------------------------------------------------
' Escape string for JSON
'----------------------------------------------------------------
Private Function JsonEscape(s As String) As String
    Dim result As String: result = s
    result = Replace(result, "\", "\\")
    result = Replace(result, """", "\""")
    result = Replace(result, vbCr, "\r")
    result = Replace(result, vbLf, "\n")
    result = Replace(result, vbTab, "\t")
    JsonEscape = result
End Function

'----------------------------------------------------------------
' Decode percent-encoded stub values
'----------------------------------------------------------------
Private Function UrlDecode(value As String) As String
    Dim result As String: result = ""
    Dim i As Long: i = 1
    Do While i <= Len(value)
        Dim ch As String: ch = Mid$(value, i, 1)
        If ch = "%" And i + 2 <= Len(value) Then
            result = result & Chr$(CLng("&H" & Mid$(value, i + 1, 2)))
            i = i + 3
        Else
            result = result & ch
            i = i + 1
        End If
    Loop
    UrlDecode = result
End Function
