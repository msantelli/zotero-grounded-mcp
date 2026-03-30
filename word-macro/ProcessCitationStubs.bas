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

' Zotero local API base URL
Private Const ZOTERO_API As String = "http://localhost:23119/api/users/0"

' Cached user ID (fetched once per run)
Private m_userId As String

'----------------------------------------------------------------
' Main entry point — call this from the Word toolbar
'----------------------------------------------------------------
Public Sub ProcessCitationStubs()
    On Error GoTo ErrHandler

    Application.ScreenUpdating = False

    ' Get user ID from first item
    m_userId = GetZoteroUserId()
    If m_userId = "" Then
        MsgBox "Could not connect to Zotero. Is the desktop app running?", vbCritical
        GoTo Cleanup
    End If

    ' Process bibliography stubs first (so citation processing doesn't shift positions)
    ProcessBibliographyStubs

    ' Process citation stubs
    Dim count As Long
    count = ProcessCiteStubs()

    ' Set Zotero document preferences
    SetZoteroPreferences

    Application.ScreenUpdating = True
    MsgBox count & " citation(s) converted to Zotero field codes." & vbCrLf & vbCrLf & _
           "Click Zotero > Refresh to format them.", vbInformation
    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    MsgBox "Error: " & Err.Description, vbCritical

Cleanup:
    Application.ScreenUpdating = True
End Sub

'----------------------------------------------------------------
' Get the numeric Zotero user ID from an item's library field
'----------------------------------------------------------------
Private Function GetZoteroUserId() As String
    Dim json As String
    json = HttpGet(ZOTERO_API & "/items?format=json&limit=1")
    If json = "" Then
        GetZoteroUserId = ""
        Exit Function
    End If

    ' Extract library.id from the JSON response
    ' The response is an array: [{"key":"...","library":{"id":12345,...},...}]
    Dim pos As Long
    pos = InStr(json, """library""")
    If pos = 0 Then
        GetZoteroUserId = ""
        Exit Function
    End If

    pos = InStr(pos, json, """id"":")
    If pos = 0 Then
        GetZoteroUserId = ""
        Exit Function
    End If

    Dim numStart As Long
    numStart = pos + 5 ' skip past "id":
    Dim numEnd As Long
    numEnd = numStart
    Do While numEnd <= Len(json) And IsNumeric(Mid(json, numEnd, 1))
        numEnd = numEnd + 1
    Loop

    GetZoteroUserId = Mid(json, numStart, numEnd - numStart)
End Function

'----------------------------------------------------------------
' Process all {{CITE:...}} stubs in the document
'----------------------------------------------------------------
Private Function ProcessCiteStubs() As Long
    Dim rng As Range
    Dim count As Long
    count = 0

    ' Search from the beginning each time (positions shift after insertion)
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

        ' Parse the stub text
        Dim stubText As String
        stubText = rng.Text

        ' Remove {{ and }}
        stubText = Mid(stubText, 3, Len(stubText) - 4) ' removes {{ and }}
        stubText = Mid(stubText, 6) ' removes CITE:

        ' Parse keys and options
        Dim parts() As String
        parts = Split(stubText, "|")

        Dim keysStr As String
        keysStr = parts(0)

        Dim locator As String: locator = ""
        Dim prefix As String: prefix = ""
        Dim suffix As String: suffix = ""
        Dim suppressAuthor As Boolean: suppressAuthor = False

        Dim i As Long
        For i = 1 To UBound(parts)
            Dim opt As String
            opt = Trim(parts(i))
            If Left(opt, 2) = "p=" Then
                locator = Mid(opt, 3)
            ElseIf Left(opt, 7) = "prefix=" Then
                prefix = Mid(opt, 8)
            ElseIf Left(opt, 7) = "suffix=" Then
                suffix = Mid(opt, 8)
            ElseIf opt = "suppress-author" Then
                suppressAuthor = True
            End If
        Next i

        ' Split keys (semicolon-separated for grouped citations)
        Dim keys() As String
        keys = Split(keysStr, ";")

        ' Build the field code
        Dim fieldCode As String
        fieldCode = BuildCitationFieldCode(keys, locator, prefix, suffix, suppressAuthor)

        If fieldCode <> "" Then
            ' Replace the stub with a field
            rng.Select
            Dim fld As Field
            Set fld = ActiveDocument.Fields.Add( _
                Range:=Selection.Range, _
                Type:=wdFieldEmpty, _
                Text:=fieldCode, _
                PreserveFormatting:=False)
            count = count + 1
        Else
            ' Could not fetch item — leave stub and move on
            ' Move past this stub to avoid infinite loop
            rng.Collapse wdCollapseEnd
        End If
    Loop

    ProcessCiteStubs = count
End Function

'----------------------------------------------------------------
' Build ADDIN ZOTERO_ITEM CSL_CITATION JSON for one citation
'----------------------------------------------------------------
Private Function BuildCitationFieldCode( _
    keys() As String, _
    locator As String, _
    prefix As String, _
    suffix As String, _
    suppressAuthor As Boolean _
) As String

    ' Generate citation ID (8 random alphanumeric chars)
    Dim citId As String
    citId = GenerateCitationId()

    ' Build citationItems array
    Dim citItems As String
    citItems = ""
    Dim displayParts As String
    displayParts = ""

    Dim i As Long
    For i = 0 To UBound(keys)
        Dim key As String
        key = Trim(keys(i))

        ' Fetch item from Zotero API
        Dim itemJson As String
        itemJson = HttpGet(ZOTERO_API & "/items/" & key & "?format=json&include=data,csljson")
        If itemJson = "" Then
            BuildCitationFieldCode = ""
            Exit Function
        End If

        ' Extract CSL-JSON (it's a JSON string inside the response)
        Dim cslJson As String
        cslJson = ExtractCslJson(itemJson)

        ' Build numeric ID from key
        Dim numId As Long
        numId = KeyToNumericId(key)

        ' Build URI
        Dim uri As String
        uri = "http://zotero.org/users/" & m_userId & "/items/" & key

        ' Build display text
        Dim display As String
        display = ExtractDisplayText(cslJson)

        ' Ensure itemData.id is numeric
        cslJson = FixItemDataId(cslJson, numId)

        ' Build citation item JSON
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
        displayParts = displayParts & Mid(display, 2, Len(display) - 2) ' strip parens
    Next i

    ' Build full display text
    Dim fullDisplay As String
    If UBound(keys) = 0 Then
        fullDisplay = "(" & displayParts & ")"
    Else
        fullDisplay = "(" & displayParts & ")"
    End If

    ' Build the complete CSL_CITATION JSON
    Dim citation As String
    citation = "{""citationID"":""" & citId & """"
    citation = citation & ",""properties"":{""formattedCitation"":""" & JsonEscape(fullDisplay) & """,""plainCitation"":""" & JsonEscape(fullDisplay) & """,""noteIndex"":0}"
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

        rng.Select
        Dim fld As Field
        Set fld = ActiveDocument.Fields.Add( _
            Range:=Selection.Range, _
            Type:=wdFieldEmpty, _
            Text:="ADDIN ZOTERO_BIBL {""uncited"":[],""omitted"":[],""custom"":[]} CSL_BIBLIOGRAPHY", _
            PreserveFormatting:=False)
    Loop
End Sub

'----------------------------------------------------------------
' Set Zotero document preferences via custom document property
'----------------------------------------------------------------
Private Sub SetZoteroPreferences()
    Dim prefData As String
    prefData = "<data data-version=""3"" zotero-version=""7.0.0"">" & _
               "<session id=""" & GenerateCitationId() & """/>" & _
               "<style id=""http://www.zotero.org/styles/apa"" locale=""en-US"" hasBibliography=""1"" bibliographyStyleHasBeenSet=""0""/>" & _
               "<prefs>" & _
               "<pref name=""fieldType"" value=""Field""/>" & _
               "<pref name=""automaticJournalAbbreviations"" value=""true""/>" & _
               "</prefs>" & _
               "</data>"

    ' Remove existing property if present
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
' HTTP GET helper using MSXML2
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
' Extract CSL-JSON from Zotero API response
' The API returns csljson as a JSON string wrapping an array
'----------------------------------------------------------------
Private Function ExtractCslJson(itemJson As String) As String
    ' Find "csljson": in the response
    Dim pos As Long
    pos = InStr(itemJson, """csljson"":")
    If pos = 0 Then
        ExtractCslJson = "{}"
        Exit Function
    End If

    ' The value is a JSON string (starts with " after the colon)
    Dim valStart As Long
    valStart = InStr(pos, itemJson, ":") + 1

    ' Skip whitespace
    Do While Mid(itemJson, valStart, 1) = " " Or Mid(itemJson, valStart, 1) = vbTab
        valStart = valStart + 1
    Loop

    Dim firstChar As String
    firstChar = Mid(itemJson, valStart, 1)

    If firstChar = """" Then
        ' It's a JSON string — need to unescape and parse
        Dim strVal As String
        strVal = ExtractJsonString(itemJson, valStart)

        ' The string contains a JSON array like [{...}]
        ' Extract the first element
        If Left(Trim(strVal), 1) = "[" Then
            Dim arrStart As Long
            arrStart = InStr(strVal, "{")
            If arrStart > 0 Then
                Dim depth As Long: depth = 0
                Dim arrEnd As Long
                Dim c As String
                Dim j As Long
                For j = arrStart To Len(strVal)
                    c = Mid(strVal, j, 1)
                    If c = "{" Then depth = depth + 1
                    If c = "}" Then
                        depth = depth - 1
                        If depth = 0 Then
                            arrEnd = j
                            Exit For
                        End If
                    End If
                Next j
                ExtractCslJson = Mid(strVal, arrStart, arrEnd - arrStart + 1)
            Else
                ExtractCslJson = "{}"
            End If
        Else
            ExtractCslJson = strVal
        End If
    ElseIf firstChar = "[" Then
        ' It's already a JSON array — extract first element
        Dim objStart As Long
        objStart = InStr(valStart, itemJson, "{")
        If objStart > 0 Then
            Dim d As Long: d = 0
            Dim objEnd As Long
            Dim k As Long
            For k = objStart To Len(itemJson)
                Dim ch As String
                ch = Mid(itemJson, k, 1)
                If ch = "{" Then d = d + 1
                If ch = "}" Then
                    d = d - 1
                    If d = 0 Then
                        objEnd = k
                        Exit For
                    End If
                End If
            Next k
            ExtractCslJson = Mid(itemJson, objStart, objEnd - objStart + 1)
        Else
            ExtractCslJson = "{}"
        End If
    Else
        ExtractCslJson = "{}"
    End If
End Function

'----------------------------------------------------------------
' Extract a JSON string value starting at the opening quote
'----------------------------------------------------------------
Private Function ExtractJsonString(json As String, startPos As Long) As String
    Dim result As String: result = ""
    Dim p As Long: p = startPos + 1 ' skip opening quote
    Dim escaped As Boolean: escaped = False

    Do While p <= Len(json)
        Dim c As String
        c = Mid(json, p, 1)

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
            Exit Do ' closing quote
        Else
            result = result & c
        End If

        p = p + 1
    Loop

    ExtractJsonString = result
End Function

'----------------------------------------------------------------
' Fix the id field inside itemData to be numeric
'----------------------------------------------------------------
Private Function FixItemDataId(cslJson As String, numId As Long) As String
    ' Replace the "id":"some-string" with "id":numId
    Dim pos As Long
    pos = InStr(cslJson, """id"":")
    If pos = 0 Then
        FixItemDataId = cslJson
        Exit Function
    End If

    Dim afterColon As Long
    afterColon = InStr(pos, cslJson, ":") + 1

    ' Skip whitespace
    Do While Mid(cslJson, afterColon, 1) = " "
        afterColon = afterColon + 1
    Loop

    Dim valChar As String
    valChar = Mid(cslJson, afterColon, 1)

    If valChar = """" Then
        ' Find closing quote
        Dim closeQuote As Long
        closeQuote = InStr(afterColon + 1, cslJson, """")
        FixItemDataId = Left(cslJson, afterColon - 1) & CStr(numId) & Mid(cslJson, closeQuote + 1)
    Else
        FixItemDataId = cslJson
    End If
End Function

'----------------------------------------------------------------
' Extract author/year for display text from CSL-JSON
'----------------------------------------------------------------
Private Function ExtractDisplayText(cslJson As String) As String
    Dim author As String: author = "Unknown"
    Dim year As String: year = "n.d."

    ' Simple extraction: find "family":"..."
    Dim famPos As Long
    famPos = InStr(cslJson, """family"":")
    If famPos > 0 Then
        Dim famStart As Long
        famStart = InStr(famPos + 9, cslJson, """") + 1
        Dim famEnd As Long
        famEnd = InStr(famStart, cslJson, """")
        author = Mid(cslJson, famStart, famEnd - famStart)
    End If

    ' Find year in "date-parts":[[YYYY]]
    Dim dpPos As Long
    dpPos = InStr(cslJson, """date-parts""")
    If dpPos > 0 Then
        Dim numPos As Long
        numPos = InStr(dpPos, cslJson, "[[")
        If numPos > 0 Then
            numPos = numPos + 2
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
' Generate an 8-character random alphanumeric string
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
' Convert item key to deterministic numeric ID (same as TypeScript)
'----------------------------------------------------------------
Private Function KeyToNumericId(key As String) As Long
    Dim hash As Long: hash = 0
    Dim i As Long
    For i = 1 To Len(key)
        hash = (hash * 31 + Asc(Mid(key, i, 1)))
        ' Keep in Long range
        If hash > 2000000000 Then hash = hash - 2000000000
        If hash < -2000000000 Then hash = hash + 2000000000
    Next i
    KeyToNumericId = Abs(hash)
End Function

'----------------------------------------------------------------
' Escape a string for JSON
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
