// Extraits prêts à coller pour relier un classeur Excel aux données hébergées (Power Query, macro VBA, curl). Logique pure, testée.
export const dataBase = (server: string, importId: string) => `${server.replace(/\/+$/, "")}/admin/v1/excel-cloud/imports/${encodeURIComponent(importId)}/data`;
export const KEY_PLACEHOLDER = "VOTRE_CLE_API";
const q = (s: string) => s.replace(/"/g, '""'); // chaîne M / VBA : guillemet doublé

/** Requête Power Query (Excel 2016+ : Données → Obtenir des données → Requête vide → Éditeur avancé). Toute la table, en CSV. */
export function powerQuery(base: string, table: string, key: string): string {
  return `let
    Source = Csv.Document(
        Web.Contents("${q(base)}/${encodeURIComponent(table)}?format=csv", [Headers = [Authorization = "Bearer ${q(key)}"]]),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    Entetes = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
in
    Entetes`;
}

export function curlExample(base: string, table: string, key: string): string {
  return `# Lire 5 lignes
curl -H "Authorization: Bearer ${key}" "${base}/${encodeURIComponent(table)}?limit=5"

# Ajouter une ligne
curl -X POST -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\
  -d '{"values":{"colonne":"valeur"}}' "${base}/${encodeURIComponent(table)}"`;
}

/** Module VBA complet (BerkiosApi) avec l'adresse et la clé déjà renseignées. */
export function vbaModule(base: string, key: string): string {
  return VBA_TEMPLATE.replace("{{URL}}", q(base)).replace("{{KEY}}", q(key));
}

// Module VBA fourni aux entreprises ({{URL}} et {{KEY}} sont remplacés). Compatible Excel 2016 → 365 (Windows) : MSXML2.ServerXMLHTTP.6.0, sans référence à ajouter.
export const VBA_TEMPLATE = String.raw`Attribute VB_Name = "BerkiosApi"
Option Explicit
' ===== BERKIOS : relie ce classeur aux données hébergées (lecture et écriture) =====
' Importer : Visual Basic (Alt+F11) > Fichier > Importer un fichier... ou coller ce code dans un nouveau module.
' Le fichier doit être enregistré en .xlsm. La clé donne accès aux données de CE classeur : ne la partagez pas.
Private Const BK_URL As String = "{{URL}}"
Private Const BK_KEY As String = "{{KEY}}"
Private bk_token As String   ' jeton de session apres BK_Login (sinon la cle ci-dessus est utilisee)
Private bk_user As String    ' reponse de la derniere connexion (champs de l'utilisateur, sans mot de passe)
Public BK_DernierMessage As String ' dernier message d'erreur de BK_Verify / BK_Login
Public BK_Alerte As String ' non vide quand le quota de l'offre approche de sa limite (80 % et plus)

' ---- Utilisation -------------------------------------------------------------------------
'  BK_LoadTable "vente", Sheets("Vente").Range("A1")          charge toute la table (en-têtes + lignes)
'  BK_Insert "vente", "numero", "5", "nom_du_client", "Test", "ttc", 1160
'  v = BK_Version("vente", "5")                               version actuelle de la ligne
'  BK_Update "vente", "5", v, "nom_du_client", "Nouveau nom"  modifie (refuse si quelqu'un d'autre l'a modifiée)
'  BK_Delete "vente", "5", v
' --------------------------------------------------------------------------------------------

Public Sub BK_LoadTable(ByVal table As String, ByVal target As Range)
    BK_LoadPath "/" & BK_UrlEncode(table) & "?format=csv", target
End Sub

' Charge dans une feuille le CSV renvoye par une route (table ou requete enregistree).
Public Sub BK_LoadPath(ByVal path As String, ByVal target As Range)
    Dim data As Variant, r As Long, c As Long
    data = BK_ParseCsv(BK_Request("GET", path, "")) ' lignes x colonnes, 1ère ligne = en-têtes
    If IsEmpty(data) Then Exit Sub
    For r = 2 To UBound(data, 1)
        For c = 1 To UBound(data, 2)
            If BK_LooksNumeric(CStr(data(r, c))) Then data(r, c) = Val(data(r, c))
        Next c
    Next r
    target.Parent.Range(target, target.Offset(UBound(data, 1) - 1, UBound(data, 2) - 1)).Value2 = data
End Sub

Public Sub BK_Insert(ByVal table As String, ParamArray pairs() As Variant)
    BK_Request "POST", "/" & BK_UrlEncode(table), "{""values"":" & BK_JsonObject(pairs) & "}"
End Sub

Public Sub BK_Update(ByVal table As String, ByVal key As String, ByVal version As Long, ParamArray pairs() As Variant)
    BK_Request "PUT", "/" & BK_UrlEncode(table) & "/" & BK_UrlEncode(key), "{""expectedVersion"":" & version & ",""values"":" & BK_JsonObject(pairs) & "}"
End Sub

Public Sub BK_Delete(ByVal table As String, ByVal key As String, ByVal version As Long)
    BK_Request "DELETE", "/" & BK_UrlEncode(table) & "/" & BK_UrlEncode(key), "{""expectedVersion"":" & version & "}"
End Sub

Public Function BK_Get(ByVal table As String, ByVal key As String) As String
    BK_Get = BK_Request("GET", "/" & BK_UrlEncode(table) & "/" & BK_UrlEncode(key), "")
End Function

Public Function BK_Version(ByVal table As String, ByVal key As String) As Long
    BK_Version = CLng(Val(BK_JsonField(BK_Get(table, key), "_berkios_version")))
End Function

' ---- Connexion des utilisateurs (le mot de passe est verifie SUR LE SERVEUR) ----------------------
' Renvoie True si le nom et le mot de passe sont corrects. Le serveur ne revele jamais l'empreinte du mot de passe.
' Pour une cle limitee a la connexion, creez-la avec le droit "Connexion seulement" (API et cles).
Public Function BK_Verify(ByVal table As String, ByVal champ As String, ByVal par As String, ByVal cle As String, ByVal secret As String) As Boolean
    Dim t As String
    On Error GoTo echec
    BK_DernierMessage = ""
    t = BK_Request("POST", "~/verify-secret", "{""table"":" & BK_JsonString(table) & ",""field"":" & BK_JsonString(champ) & ",""by"":" & BK_JsonString(par) & ",""key"":" & BK_JsonString(cle) & ",""secret"":" & BK_JsonString(secret) & "}")
    BK_Verify = (InStr(t, """valid"":true") > 0)
    If Not BK_Verify Then BK_DernierMessage = "Nom ou mot de passe incorrect."
    Exit Function
echec:
    BK_DernierMessage = Err.Description
    BK_Verify = False
End Function

' Ouvre une session : le serveur verifie le mot de passe puis renvoie un jeton qui expire. Facultatif : actif = colonne qui desactive un compte.
Public Function BK_Login(ByVal table As String, ByVal champ As String, ByVal par As String, ByVal cle As String, ByVal secret As String, Optional ByVal actif As String = "") As Boolean
    Dim t As String, b As String
    On Error GoTo echec
    BK_DernierMessage = "": bk_token = "": bk_user = ""
    b = "{""table"":" & BK_JsonString(table) & ",""field"":" & BK_JsonString(champ) & ",""by"":" & BK_JsonString(par) & ",""key"":" & BK_JsonString(cle) & ",""secret"":" & BK_JsonString(secret)
    If Len(actif) > 0 Then b = b & ",""activeField"":" & BK_JsonString(actif)
    t = BK_Request("POST", "~/login", b & "}")
    bk_token = BK_JsonField(t, "token")
    bk_user = t
    BK_Login = (Len(bk_token) > 0)
    Exit Function
echec:
    BK_DernierMessage = Err.Description
    bk_token = "": BK_Login = False
End Function

' Valeur d'une colonne de l'utilisateur connecte (ex. BK_UserField("role")).
Public Function BK_UserField(ByVal champ As String) As String
    BK_UserField = BK_JsonField(bk_user, champ)
End Function
' Droits de l'utilisateur connecte : BK_Can("vente", "update"), BK_Can("total-global", "query"), BK_Can("payer", "action").
' op : read, create, update, delete (tables) ; "query" ou "action" pour une requete ou une action enregistree. Sert a griser un bouton.
Public Function BK_Can(ByVal cible As String, Optional ByVal op As String = "read") As Boolean
    Dim p As String
    On Error GoTo echec
    If op = "query" Then
        p = "query=" & BK_UrlEncode(cible)
    ElseIf op = "action" Then
        p = "action=" & BK_UrlEncode(cible)
    Else
        p = "table=" & BK_UrlEncode(cible) & "&op=" & BK_UrlEncode(op)
    End If
    BK_Can = (InStr(BK_Request("GET", "~/can?" & p, ""), """allowed"":true") > 0)
    Exit Function
echec:
    BK_Can = False
End Function
Public Function BK_Connected() As Boolean
    BK_Connected = (Len(bk_token) > 0)
End Function
Public Sub BK_Logout()
    On Error Resume Next
    If Len(bk_token) > 0 Then BK_Request "POST", "~/logout", "{}"
    bk_token = "": bk_user = ""
End Sub

' ---- Réseau --------------------------------------------------------------------------------
Private Function BK_Request(ByVal method As String, ByVal path As String, ByVal body As String) As String
    Dim http As Object, txt As String
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 10000, 10000, 60000, 120000
    ' Un chemin qui commence par ~ part de la racine du classeur (requetes /q/ et actions /act/) au lieu de /data.
    If Left$(path, 1) = "~" Then
        http.Open method, Left$(BK_URL, Len(BK_URL) - 5) & Mid$(path, 2), False
    Else
        http.Open method, BK_URL & path, False
    End If
    ' La verification et la connexion utilisent toujours la cle ; le reste utilise la session si l'utilisateur est connecte.
    If Len(bk_token) > 0 And path <> "~/login" And path <> "~/verify-secret" Then
        http.setRequestHeader "Authorization", "Bearer " & bk_token
    Else
        http.setRequestHeader "Authorization", "Bearer " & BK_KEY
    End If
    http.setRequestHeader "Accept", "application/json"
    If Len(body) > 0 Then
        http.setRequestHeader "Content-Type", "application/json"
        http.send body
    Else
        http.send
    End If
    txt = http.responseText
    BK_Alerte = ""
    On Error Resume Next
    BK_Alerte = http.getResponseHeader("X-Berkios-Quota")
    On Error GoTo 0
    If Len(BK_Alerte) > 0 Then BK_Alerte = "Quota BERKIOS bientot atteint (" & BK_Alerte & "). Pensez a changer d'offre."
    If http.Status >= 400 Then
        Dim m As String: m = BK_JsonField(txt, "message")
        If Len(m) = 0 Then m = "erreur " & http.Status
        Err.Raise vbObjectError + 513, "BerkiosApi", "Serveur BERKIOS : " & m & " (code " & http.Status & ")"
    End If
    If Left$(txt, 1) = ChrW(&HFEFF) Then txt = Mid$(txt, 2)
    If Left$(txt, 3) = ChrW(&HEF) & ChrW(&HBB) & ChrW(&HBF) Then txt = Mid$(txt, 4)
    BK_Request = txt
End Function

' ---- JSON minimal (objets plats) -------------------------------------------------------------
Private Function BK_JsonObject(ByRef pairs As Variant) As String
    Dim i As Long, s As String
    If (UBound(pairs) - LBound(pairs) + 1) Mod 2 <> 0 Then Err.Raise vbObjectError + 514, "BerkiosApi", "Les valeurs vont par paires : nom du champ, valeur."
    For i = LBound(pairs) To UBound(pairs) Step 2
        If Len(s) > 0 Then s = s & ","
        s = s & BK_JsonString(CStr(pairs(i))) & ":" & BK_JsonValue(pairs(i + 1))
    Next i
    BK_JsonObject = "{" & s & "}"
End Function

Private Function BK_JsonValue(ByVal v As Variant) As String
    Select Case VarType(v)
        Case vbNull, vbEmpty: BK_JsonValue = "null"
        Case vbBoolean: BK_JsonValue = IIf(v, "true", "false")
        Case vbInteger, vbLong, vbSingle, vbDouble, vbCurrency, vbDecimal, vbByte
            BK_JsonValue = Replace(Trim$(Str$(v)), ",", ".")
        Case vbDate: BK_JsonValue = BK_JsonString(Format$(v, IIf(v = Int(v), "yyyy-mm-dd", "yyyy-mm-dd hh:nn:ss")))
        Case Else: BK_JsonValue = BK_JsonString(CStr(v))
    End Select
End Function

Private Function BK_JsonString(ByVal s As String) As String
    Dim i As Long, ch As String, code As Long, out As String
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1): code = AscW(ch) And &HFFFF&
        Select Case code
            Case 34: out = out & "\"""
            Case 92: out = out & "\\"
            Case 8: out = out & "\b"
            Case 9: out = out & "\t"
            Case 10: out = out & "\n"
            Case 12: out = out & "\f"
            Case 13: out = out & "\r"
            Case 0 To 31, 127 To 65535: out = out & "\u" & Right$("0000" & Hex$(code), 4)
            Case Else: out = out & ch
        End Select
    Next i
    BK_JsonString = """" & out & """"
End Function

' Valeur d'un champ d'un objet JSON plat : texte (guillemets retirés), nombre, ou "" si absent / null.
Private Function BK_JsonField(ByVal json As String, ByVal field As String) As String
    Dim p As Long, q As Long, i As Long, ch As String, out As String
    p = InStr(json, """" & field & """:")
    If p = 0 Then Exit Function
    p = p + Len(field) + 3
    Do While Mid$(json, p, 1) = " ": p = p + 1: Loop
    If Mid$(json, p, 1) = """" Then
        i = p + 1
        Do While i <= Len(json)
            ch = Mid$(json, i, 1)
            If ch = "\" Then
                i = i + 1: ch = Mid$(json, i, 1)
                Select Case ch
                    Case "n": out = out & vbLf
                    Case "t": out = out & vbTab
                    Case "u": out = out & ChrW(CLng("&H" & Mid$(json, i + 1, 4))): i = i + 4
                    Case Else: out = out & ch
                End Select
            ElseIf ch = """" Then
                Exit Do
            Else
                out = out & ch
            End If
            i = i + 1
        Loop
        BK_JsonField = out
    Else
        q = p
        Do While q <= Len(json) And InStr(",}] " & vbCr & vbLf, Mid$(json, q, 1)) = 0: q = q + 1: Loop
        out = Mid$(json, p, q - p)
        If out <> "null" Then BK_JsonField = out
    End If
End Function

' ---- Aides utilisées par les fonctions générées pour chaque table ---------------------------------
Private Function BK_Add(ByVal j As String, ByVal field As String, ByVal v As Variant) As String
    If Len(j) > 0 Then j = j & ","
    BK_Add = j & BK_JsonString(field) & ":" & BK_JsonValue(v)
End Function

' Ajoute &nom=valeur a une chaine de requete (nombres avec un point, dates AAAA-MM-JJ).
Private Function BK_Qs(ByVal qs As String, ByVal nom As String, ByVal v As Variant) As String
    Dim t As String
    If IsNull(v) Or IsEmpty(v) Then
        BK_Qs = qs: Exit Function
    ElseIf VarType(v) = vbDate Then
        t = Format$(v, "yyyy-mm-dd")
    ElseIf VarType(v) = vbString Then
        t = v
    ElseIf IsNumeric(v) Then
        t = Trim$(Str$(v))
    Else
        t = CStr(v)
    End If
    BK_Qs = qs & "&" & BK_UrlEncode(nom) & "=" & BK_UrlEncode(t)
End Function

' Texte ISO du serveur (2026-01-05 ou 2026-01-05T08:30:00Z, heure UTC) -> Date ; vide si absent.
Private Function BK_ToDate(ByVal s As String) As Variant
    Dim d As Date
    If Len(s) < 10 Then Exit Function
    On Error GoTo bad
    d = DateSerial(CInt(Mid$(s, 1, 4)), CInt(Mid$(s, 6, 2)), CInt(Mid$(s, 9, 2)))
    If Len(s) >= 19 Then d = d + TimeSerial(CInt(Mid$(s, 12, 2)), CInt(Mid$(s, 15, 2)), CInt(Mid$(s, 18, 2)))
    BK_ToDate = d
    Exit Function
bad:
    BK_ToDate = s
End Function

' Charge une table dans la feuille "BK_<table>" (créée si besoin).
Public Sub BK_LoadInSheet(ByVal table As String)
    Dim ws As Worksheet, nm As String
    nm = Left$("BK_" & table, 31)
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(nm)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = nm
    Else
        ws.Cells.Clear
    End If
    BK_LoadTable table, ws.Range("A1")
End Sub

' ---- Utilitaires -----------------------------------------------------------------------------
Private Function BK_UrlEncode(ByVal s As String) As String
    Dim i As Long, code As Long, ch As String, out As String, b As Long, bytes() As Byte
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1): code = AscW(ch) And &HFFFF&
        If (code >= 48 And code <= 57) Or (code >= 65 And code <= 90) Or (code >= 97 And code <= 122) Or ch = "-" Or ch = "_" Or ch = "." Then
            out = out & ch
        ElseIf code < 128 Then
            out = out & "%" & Right$("0" & Hex$(code), 2)
        Else
            bytes = BK_Utf8(ch)
            For b = 0 To UBound(bytes): out = out & "%" & Right$("0" & Hex$(bytes(b)), 2): Next b
        End If
    Next i
    BK_UrlEncode = out
End Function

Private Function BK_Utf8(ByVal ch As String) As Byte()
    Dim code As Long: code = AscW(ch) And &HFFFF&
    Dim r() As Byte
    If code < 2048 Then
        ReDim r(1): r(0) = &HC0 Or (code \ 64): r(1) = &H80 Or (code And 63)
    Else
        ReDim r(2): r(0) = &HE0 Or (code \ 4096): r(1) = &H80 Or ((code \ 64) And 63): r(2) = &H80 Or (code And 63)
    End If
    BK_Utf8 = r
End Function

' Nombre « sûr » à convertir : pas de zéro initial (codes, téléphones), au plus 15 chiffres, point comme séparateur décimal.
Private Function BK_LooksNumeric(ByVal s As String) As Boolean
    If Len(s) = 0 Or Len(s) > 16 Then Exit Function
    If s Like "*[!0-9.-]*" Then Exit Function
    If s = "-" Or s = "." Or s Like "*.*.*" Or s Like "?*-*" Then Exit Function
    If Left$(s, 1) = "0" And Len(s) > 1 And Mid$(s, 2, 1) <> "." Then Exit Function
    If Left$(s, 2) = "-0" And Len(s) > 2 And Mid$(s, 3, 1) <> "." Then Exit Function
    BK_LooksNumeric = True
End Function

' CSV (guillemets, virgules et sauts de ligne dans les valeurs) -> tableau [ligne, colonne] à partir de 1.
Private Function BK_ParseCsv(ByVal t As String) As Variant
    Dim rows As Collection, cur As Collection, i As Long, n As Long, ch As String, field As String, inQ As Boolean, maxC As Long
    Set rows = New Collection: Set cur = New Collection
    n = Len(t): i = 1
    Do While i <= n
        ch = Mid$(t, i, 1)
        If inQ Then
            If ch = """" Then
                If Mid$(t, i + 1, 1) = """" Then field = field & """": i = i + 1 Else inQ = False
            Else
                field = field & ch
            End If
        ElseIf ch = """" Then
            inQ = True
        ElseIf ch = "," Then
            cur.Add field: field = ""
        ElseIf ch = vbCr Or ch = vbLf Then
            If ch = vbCr And Mid$(t, i + 1, 1) = vbLf Then i = i + 1
            cur.Add field: field = ""
            If cur.Count > maxC Then maxC = cur.Count
            rows.Add cur: Set cur = New Collection
        Else
            field = field & ch
        End If
        i = i + 1
    Loop
    If Len(field) > 0 Or cur.Count > 0 Then cur.Add field: If cur.Count > maxC Then maxC = cur.Count
    If cur.Count > 0 Then rows.Add cur
    If rows.Count = 0 Then Exit Function
    Dim a() As Variant, r As Long, c As Long
    ReDim a(1 To rows.Count, 1 To maxC)
    For r = 1 To rows.Count
        For c = 1 To rows(r).Count: a(r, c) = rows(r)(c): Next c
    Next r
    BK_ParseCsv = a
End Function
`;
