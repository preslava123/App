/*
* Simple Cloud Code Example
*/


Parse.Cloud.beforeSave(Parse.User, function(request, response) {
  var user = request.object;

  if (user.get("favoriteRecipes") == null) {
      user.set("favoriteRecipes", new Array());
  }

  if (user.get("wasted_dates") == null) {
  	  user.set("wasted_dates", new Array());
  }

  if (user.get("used_dates") == null) {
  	  user.set("used_dates", new Array());
  }

  user.set("email", user.get("username"));

  response.success();

});

Parse.Cloud.afterDelete(Parse.User, function(request, response) {
  var user = request.object;

  var queryPurchasedItems = new Parse.Query("PurchasedItem");
  var userPointer = {
      "__type": "Pointer",
      "className": "_User",
      "objectId": user.id
    }

      queryPurchasedItems.equalTo("purchasedBy", userPointer);

      queryPurchasedItems.find({useMasterKey:true}).then((results) => {
      Parse.Object.destroyAll(results,{
          useMasterKey: true
        }).then(function(returnValue) {
          response.success();
        }, function(error) {
          response.error(error);
        });

    })
    .catch((error) =>  {
      response.error(error);
    });

});


Parse.Cloud.beforeSave("Recipe", function(request, response) {
  var newRecipe = request.object;
  var ingredients = String(newRecipe.get("ingredients"));
  var enteredCategories = ingredients.split('; ');

  var queryCategories = new Parse.Query("Category");
  queryCategories.containedIn("name", enteredCategories);
  queryCategories.find({useMasterKey:true}).then((results) => {

      newRecipe.set("ingredient_pointers", results);

      var categoryNames = results.map(a => a.get("name"));
      newRecipe.set("ingredients", categoryNames.join('; '));

      response.success();
  })
  .catch((error) => {
    response.error(error);
  });

});

Parse.Cloud.beforeSave("Product", function(request, response) {

  var newProduct = request.object;

  if (newProduct.get("verified") == true) {
      var queryPurchasedItems = new Parse.Query("PurchasedItem");
      queryPurchasedItems.equalTo("productCode", newProduct.get("code"));
      queryPurchasedItems.find({useMasterKey:true}).then((results) => {

      for (var i = 0; i < results.length; i++) {
         results[i].set("productName", newProduct.get("name"));;
         results[i].set("productQuantity", newProduct.get("quantity"));
         results[i].set("category", newProduct.get("category"));
         results[i].set("packaging", newProduct.get("packaging"));
         results[i].set("brands", newProduct.get("brands"));

         var image = newProduct.get("image");

         if (image == null) {
          results[i].unset("image");
         } else {
          results[i].set("image", image);
         }
         
         results[i].save(null, {useMasterKey:true});
       }

       response.success();

    })
    .catch((error) =>  {
      response.error(error);
    });
  } else {
    response.success();
  }
  
});


Parse.Cloud.afterSave("Product", function(request, response) {

  var newProduct = request.object;
  var image = newProduct.get("image");

  if (image != null) {
    image.set("product", newProduct);
    image.save(null, {useMasterKey:true});
    response.success();
  } else {
    response.success();
  }
});

Parse.Cloud.beforeDelete('Product', function(request, response) {
  var product = request.object;
  var imagePointer = product.get("image");

  if (imagePointer != null) {
    imagePointer.fetch({useMasterKey:true}).then((image) => {
      image.destroy({useMasterKey: true});
      response.success();
  })
  .catch((error) =>  {
      response.error(error);
  });
  } else {
    response.success();
  }
  
});    

Parse.Cloud.beforeSave("PurchasedItem", function(request, response) {
  var item = request.object;

  if (!item.existed() && request.user != null) {
    item.set("purchasedBy", request.user);

    var barcode = item.get("productCode");

    if (barcode == null) {
    	var date = new Date();
    	item.set("productCode", date.getTime().toString() + request.user.id);
    	item.set("exclusiveForUser", true);
    } else {
    	item.set("exclusiveForUser", false);
    }
  }
  
  response.success();

});

Parse.Cloud.afterSave("PurchasedItem", function(request, response) {
  console.warn("aftersave hook");

  var Product = Parse.Object.extend("Product");
  var purchasedItem = request.object;

  if (request.user == null || purchasedItem.get("exclusiveForUser") == true) {
    //if this is called by the admin panel just return
    response.success();
    return
  }

  var userPointer = {
      "__type": "Pointer",
      "className": "_User",
      "objectId": request.user.id
    }

  var moderatorQuery = new Parse.Query(Parse.Role);
  moderatorQuery.equalTo('name', 'Moderator');
  moderatorQuery.equalTo('users', request.user);
  moderatorQuery.first({useMasterKey:true}).then((moderatorRole) => {
    //check if user is moderator
      var isModerator = false
      if (moderatorRole != null) {
        isModerator = true
      }

      var queryUnverifiedProducts = new Parse.Query("Product");
    queryUnverifiedProducts.equalTo("addedBy", userPointer);
    queryUnverifiedProducts.equalTo("verified", false);
    queryUnverifiedProducts.count({useMasterKey:true}).then((count) => {
      if (count < 4 || isModerator == true) {

      var queryProducts = new Parse.Query("Product");
      queryProducts.equalTo("code", purchasedItem.get("productCode"));
      queryProducts.find({useMasterKey:true}).then((results) => {
      if (results.length == 0) {

        console.warn("not found object");

        var product = new Product();
        var verified = (isModerator == true) ? true : false;
        product.set("name", purchasedItem.get("productName"));
        product.set("code", purchasedItem.get("productCode"));
        product.set("quantity", purchasedItem.get("productQuantity"));;
        product.set("packaging", purchasedItem.get("packaging"));
        product.set("category", purchasedItem.get("category"));
        product.set("image", purchasedItem.get("image"));
        product.set("verified", false);
        product.set("brands", purchasedItem.get("brands"));
        product.set("addedBy", request.user);
        product.save(null, {useMasterKey: true});

        response.success();

      } else {
        console.warn("found object");
        response.success();
      }
      
    })
    .catch((error) =>  {
      response.error(error);
    });


    } else {
      console.warn("too many unverified objects");
      response.success();
    }
  })
  .catch((error) =>  {
      response.error(error);
    });
  })
  .catch((error) =>  {
      response.error(error);
    });
  
});


Parse.Cloud.beforeDelete("Image", function(request, response) {
  var image = request.object;
  var imagePointer = {
      "__type": "Pointer",
      "className": "Image",
      "objectId": image.id
    }

    var queryProducts = new Parse.Query("Product");
    queryProducts.equalTo("image", imagePointer);

  
    queryProducts.find({useMasterKey:true}).then((results) => {
      for (var i = 0; i < results.length; i++) {
         results[i].unset("image");
       }

       Parse.Object.saveAll(results,{
          useMasterKey: true
        }).then(function(returnValue) {
          response.success();
        }, function(error) {
          response.error(error);
        });

    })
    .catch((error) =>  {
      response.error(error);
    });

});

Parse.Cloud.afterDelete("Image", function(request, response) {
  var image = request.object;
  var imageName = image.get("image_data").name();
  Parse.Cloud.httpRequest({
  method: "DELETE",
  url: "https://pg-app-11xq45gj65jqciu5077jrrdidy4hlw.scalabl.cloud/1/files/"+imageName,
  headers: {
    "X-Parse-Application-Id": "13chpRfD5A7pQSZJHRQE5evFsTO9OMVmj99PjR3L",
    "X-Parse-Master-Key": "tQZkCTbZYjJwycReHyKwC6hoBoQROsjP9TL9V9kO",
    "X-Parse-REST-API-Key" : "L4BA937y6WR7zqLa5CZ8ISk4jn9PLVcR9sgT9mO8"
  }
}).then(function(httpResponse) {
  response.success();
}, function(httpResponse) {
  console.warn('Request failed with response code ' + httpResponse.status);
  response.error(error);

});
});

//--------------------- Background jobs -----------
// Parse.Cloud.job("cleanup", function(request, response) {
//   var date = new Date();
//   var last = new Date(date.getTime() - (90 * 24 * 60 * 60 * 1000));
//   var queryPurchasedItems = new Parse.Query("PurchasedItem");
//   queryPurchasedItems.lessThan('createdAt', last);
//   queryPurchasedItems.find({useMasterKey:true}).then((results) => {
//       Parse.Object.destroyAll(results,{
//           useMasterKey: true
//         }).then(function(returnValue) {
//           response.success();
//         }, function(error) {
//           response.error(error);
//         });
//   })
//   .catch((error) =>  {
//       response.error(error);
//   });
  
// });

